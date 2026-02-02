from flask_cors import CORS
import os
from werkzeug.utils import secure_filename
import PyPDF2
import csv, re, unicodedata

import sys
from pathlib import Path

import re

# Add the project root (one level up from this file) to sys.path
try:
    BASE_DIR = Path(__file__).resolve().parent
except:
    BASE_DIR = Path("C:/Users/SKinshuck/Desktop/pdf_breakdown2/pdf_breakdown/backend")
PROJECT_ROOT = BASE_DIR.parent
sys.path.append(str(PROJECT_ROOT))



import shutil
import subprocess

import fitz
from openai import BadRequestError

from flask import Flask, request, jsonify, send_from_directory
import pandas as pd
import base64
from datetime import datetime
from PyPDF2 import PdfReader
from backend.gpt_interface import (
    get_response_from_chatgpt_multiple_image_and_functions,
    get_markdown_schema
)

import uuid
from typing import List, Dict
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

from dataclasses import dataclass
import time
from typing import Any
import traceback

# ---- Import your existing utilities -----------------------------------------
from backend.sharepoint import (
    sharepoint_create_context,
    sharepoint_folder_exists,
    sharepoint_file_exists,
    sharepoint_export_df_to_csv,
    sharepoint_delete_file_by_path,
    sharepoint_import_excel,
    sharepoint_create_folder,
)
from backend.database import (
    save_prompt,
    search_prompts,
    get_prompt_by_id,
    delete_prompt,
    save_feedback,

    # page results
    create_page_results_table,
    append_page_result,
    get_all_page_results,
    delete_page_results_table,

    # job metadata
    create_job,
    get_job,
    touch_job_processing_started_at,
    delete_job,
)
from io import BytesIO

@dataclass
class ConnectionInfo:
    site_url: str
    tenant: str
    client_id: str

_CONNECTIONS: Dict[str, ConnectionInfo] = {}

# Cached ClientContext objects keyed by context_id
_CTX_CACHE: Dict[str, tuple[Any, float]] = {}  # value = (ctx, created_timestamp)
_CTX_CACHE_LOCK = threading.Lock()
CTX_TTL_SECONDS = 300



EXECUTOR = ThreadPoolExecutor(max_workers=3)


# -----------------------------------------------------------------------------
# Cached context helper
# -----------------------------------------------------------------------------

def _new_ctx(conn_id: str):
    """Return a cached ClientContext, refreshing if older than CTX_TTL_SECONDS.

    We keep an in‑memory cache so repeated API calls in short succession don’t
    trigger the slow device‑code flow that pops a browser window on the server.
    """
    info = _CONNECTIONS.get(conn_id)
    if info is None:
        raise ValueError("Invalid or expired context_id")

    now = time.time()
    with _CTX_CACHE_LOCK:
        cached = _CTX_CACHE.get(conn_id)
        if cached is not None:
            ctx, created_at = cached
            if now - created_at < CTX_TTL_SECONDS:
                return ctx  # fresh enough, re‑use it
        # Either no cache entry or it is stale – create a new one
        ctx = sharepoint_create_context(
            info.site_url, tenant=info.tenant, client_id=info.client_id
        )
        _CTX_CACHE[conn_id] = (ctx, now)
        return ctx
    

def _df_to_xlsx_bytesio(df: pd.DataFrame) -> BytesIO:
    """
    Convert df to an in-memory XLSX (BytesIO) using openpyxl.
    """
    xlsx_io = BytesIO()
    with pd.ExcelWriter(xlsx_io, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="output")
    xlsx_io.seek(0)
    return xlsx_io


def _sharepoint_upload_bytes_overwrite(ctx, sp_folder_name: str, sp_file_name: str, content: BytesIO) -> bool:
    """
    Upload BytesIO to SharePoint folder, overwriting if it already exists.
    Uses folder.files.add(name, content, overwrite=True).
    """
    try:
        folder = ctx.web.get_folder_by_server_relative_url(sp_folder_name)
        content.seek(0)
        folder.files.add(sp_file_name, content, True).execute_query()
        return True
    except Exception as e:
        print(f"SharePoint XLSX upload failed: {e}")
        return False
    

def list_children(ctx, server_relative_folder: str):
    """Return dict with 'folders' and 'files' lists for a folder."""
    folder = ctx.web.get_folder_by_server_relative_url(server_relative_folder).expand(["Folders", "Files"]).get().execute_query()
    folders = []
    for f in folder.folders:  # type: ignore[attr-defined]
        folders.append({
            "name": f.name,
            "serverRelativeUrl": f.serverRelativeUrl,
            "timeCreated": getattr(f, "time_created", None),
            "timeLastModified": getattr(f, "time_last_modified", None),
        })
    files = []
    for fl in folder.files:  # type: ignore[attr-defined]
        files.append({
            "name": fl.name,
            "serverRelativeUrl": fl.serverRelativeUrl,
            "length": getattr(fl, "length", None),
            "timeCreated": getattr(fl, "time_created", None),
            "timeLastModified": getattr(fl, "time_last_modified", None),
        })
    return {"folders": folders, "files": files}


def walk_tree(ctx, root: str, depth: int = 2):
    """Recursively collect folder & file info down to 'depth' levels."""
    def _walk(path: str, level: int):
        node = list_children(ctx, path)
        result = {
            "path": path,
            "folders": node["folders"],
            "files": node["files"],
        }
        if level < depth:
            result["children"] = []
            for sub in node["folders"]:
                result["children"].append(_walk(sub["serverRelativeUrl"], level + 1))
        return result
    return _walk(root, 0)


def search_tree(ctx, root: str, query: str, depth: int = 2):
    """Naive substring search over name, up to depth."""
    q = query.lower()
    matches = {
        "folders": [],
        "files": [],
    }

    def _walk(path: str, level: int):
        node = list_children(ctx, path)
        for f in node["folders"]:
            if q in f["name"].lower():
                matches["folders"].append(f)
        for fl in node["files"]:
            if q in fl["name"].lower():
                matches["files"].append(fl)
        if level < depth:
            for sub in node["folders"]:
                _walk(sub["serverRelativeUrl"], level + 1)

    _walk(root, 0)
    return matches

try:
    BASE_DIR = Path(__file__).resolve().parent
except NameError:
    BASE_DIR = Path.cwd()

import tempfile
UPLOAD_ROOT = Path(tempfile.gettempdir()) / "pdf_breakdown_uploads"
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)




def _ensure_png_size(img_path: Path,
                     max_bytes: int = 10 * 1024 * 1024,
                     min_side_px: int = 256,
                     downscale_step: float = 0.90,
                     quantize_steps: list[int] = [256, 128, 64]) -> Path:
    """
    Ensure *img_path* (PNG) is ≤ *max_bytes* while keeping it PNG.

    Strategy:
    • Try palette quantization (256→128→64 colors) with PNG optimize.
    • If still too big, progressively downscale by 10% until it fits
      or the shortest edge reaches *min_side_px*.
    """
    from PIL import Image

    if img_path.stat().st_size <= max_bytes:
        return img_path

    with Image.open(img_path) as im:
        # Work in RGBA when possible; quantize will palette it.
        im = im.convert("RGBA")

        # 1) Quantization passes
        for colors in quantize_steps:
            im_q = im.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)
            im_q.save(img_path, format="PNG", optimize=True, compress_level=9)
            if img_path.stat().st_size <= max_bytes:
                return img_path

        # 2) Resolution sweep
        curr = im
        while img_path.stat().st_size > max_bytes and min(curr.size) > min_side_px:
            new_w = max(min_side_px, int(curr.width * downscale_step))
            new_h = max(min_side_px, int(curr.height * downscale_step))
            if new_w == curr.width and new_h == curr.height:
                break
            curr = curr.resize((new_w, new_h), Image.LANCZOS)
            curr.save(img_path, format="PNG", optimize=True, compress_level=9)

    return img_path

from contextlib import contextmanager

@contextmanager
def rasterize_pdf_pages_to_temp_pngs(pdf_path: Path, pages: List[int], dpi: int = 200) -> Dict[int, Path]:
    """
    Rasterize selected PDF pages to PNGs in a TemporaryDirectory and ALWAYS clean it up.
    Returns {page_number: png_path}.
    """
    doc = None
    tmp_obj = None
    try:
        doc = fitz.open(str(pdf_path))
        max_page = len(doc)

        pages_to_render = []
        for p in pages:
            try:
                p_int = int(p)
            except Exception:
                continue
            if 1 <= p_int <= max_page:
                pages_to_render.append(p_int)

        tmp_obj = tempfile.TemporaryDirectory(prefix=f"{pdf_path.stem}_")
        tmp_dir = Path(tmp_obj.name)

        scale = dpi / 72.0
        mtx = fitz.Matrix(scale, scale)

        out: Dict[int, Path] = {}
        for p in pages_to_render:
            page = doc[p - 1]
            pix = page.get_pixmap(matrix=mtx)
            png_path = tmp_dir / f"page_{p:04d}.png"
            pix.save(str(png_path))
            _ensure_png_size(png_path)
            out[p] = png_path

        yield out
    finally:
        if doc is not None:
            try:
                doc.close()
            except Exception:
                pass
        if tmp_obj is not None:
            try:
                tmp_obj.cleanup()
            except Exception:
                pass



def _pdf_path_for_file_id(file_id: str) -> str:
    """
    Look up the canonical PDF stored as uploads/<file_id>/document.pdf
    """
    pdf_path = UPLOAD_ROOT / file_id / 'document.pdf'
    if not pdf_path.exists():
        raise FileNotFoundError(
            f"PDF not found for file_id={file_id} at {pdf_path}")
    return str(pdf_path)



def _ensure_pdf_in_folder(original_path: Path, dest_dir: Path) -> Path:
    """
    Ensure there's a canonical PDF at dest_dir/document.pdf.
    If original is already a PDF, copy it. Otherwise convert with LibreOffice.
    """
    dest_dir.mkdir(parents=True, exist_ok=True)
    canonical_pdf = dest_dir / 'document.pdf'

    ext = original_path.suffix.lower()
    if ext == '.pdf':
        shutil.copy2(str(original_path), str(canonical_pdf))
        return canonical_pdf

    # Convert via LibreOffice
    try:
        result = subprocess.run([
            'soffice', '--headless', '--convert-to', 'pdf', '--outdir',
            str(dest_dir),
            str(original_path)
        ],
                                capture_output=True,
                                text=True,
                                timeout=60)
        if result.returncode != 0:
            raise RuntimeError(result.stderr
                               or 'LibreOffice conversion failed')

        # LibreOffice writes "<basename>.pdf" in dest_dir — rename to document.pdf
        produced = dest_dir / (original_path.stem + '.pdf')
        if not produced.exists():
            raise FileNotFoundError(
                f"LibreOffice reported success but PDF not found: {produced}")
        produced.replace(canonical_pdf)
        return canonical_pdf
    except Exception as e:
        raise RuntimeError(f"Failed to convert to PDF: {e}")


def _compose_user_prompt(role: str, task: str, context: str, fmt: str,
                         constraints: str) -> str:
    # "Appropriate headings" with simple sections
    return (f"# Role\n{role or ''}\n\n"
            f"# Task\n{task or ''}\n\n"
            f"# Context\n{context or ''}\n\n"
            f"# Output Format\n{fmt or ''}\n\n"
            f"# Constraints\n{constraints or ''}\n")


app = Flask(__name__, static_folder= str(PROJECT_ROOT) + '/frontend/build', static_url_path='')
CORS(app)  # allow all origins; tighten in prod


# Configuration
ALLOWED_EXTENSIONS = {'pdf'}
app.config['UPLOAD_FOLDER'] = str(UPLOAD_ROOT)

# Ensure root exists
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)



def allowed_file(filename):
    return '.' in filename and filename.rsplit(
        '.', 1)[1].lower() in ALLOWED_EXTENSIONS


import math

def normalize(value):
    # None → ""
    if value is None:
        return ""
    # NaN (float('nan'), numpy.nan, etc.) → ""
    try:
        if isinstance(value, float) and math.isnan(value):
            return ""
    except TypeError:
        pass
    return value


import time
import shutil

def cleanup_upload_root(max_age_seconds: int = 3600):
    """
    Delete per-file_id directories under UPLOAD_ROOT that are older than max_age_seconds.
    """
    now = time.time()
    if not UPLOAD_ROOT.exists():
        return
    for child in UPLOAD_ROOT.iterdir():
        try:
            if child.is_dir():
                age = now - child.stat().st_mtime
                if age > max_age_seconds:
                    shutil.rmtree(child, ignore_errors=True)
        except Exception:
            # Don't let cleanup errors break requests
            traceback.print_exc()

@app.before_request
def _cleanup_uploads_periodically():
    # this is cheap enough to run each request
    cleanup_upload_root()


@app.route('/download/<path:filename>', methods=['GET'])
def download(filename):
    # Let Flask infer mimetype from extension; don't force CSV.
    return send_from_directory(
        app.config['UPLOAD_FOLDER'],
        filename,
        as_attachment=True
    )

@app.route("/api/prepare_sharepoint_pdf", methods=["POST"])
def prepare_sharepoint_pdf():
    """
    Download ONE SharePoint PDF into UPLOAD_ROOT and return {file_id, page_count, file_stem, filename}.
    This lets folder-mode avoid downloading everything up-front.
    """
    try:
        data = request.get_json(force=True)

        folderName = data.get("folderName")
        siteName   = data.get("siteName", "GADOpportunitiesandSolutions")
        tenant     = data.get("tenant", "tris42.onmicrosoft.com")
        client_id  = data.get("client_id", "d44a05d5-c6a5-4bbb-82d2-443123722380")

        # Either provide full server-relative path OR folder+filename
        sp_file_path = data.get("sp_file_path")
        filename     = data.get("filename")

        if not sp_file_path:
            if not (folderName and filename):
                return jsonify({"success": False, "error": "Provide either sp_file_path OR (folderName + filename)"}), 400
            sp_file_path = f"{folderName.rstrip('/')}/{filename}".replace("//", "/")

        if not filename:
            filename = Path(sp_file_path).name

        sp_site_url = f"https://tris42.sharepoint.com/sites/{siteName}/"
        ctx = sharepoint_create_context(sp_site_url, tenant, client_id)

        info = _download_sp_file_to_upload(ctx, sp_file_path, filename)

        return jsonify({
            "success": True,
            "filename": normalize(info["filename"]),
            "page_count": int(info["page_count"]),
            "file_id": normalize(info["file_id"]),
            "file_stem": normalize(info["file_stem"]),
            "sp_file_path": sp_file_path,
        }), 200

    except Exception as e:
        tb = traceback.format_exc()
        print("!" * 80)
        print("Unhandled error in prepare_sharepoint_pdf")
        print(tb)
        return jsonify({"success": False, "error": str(e)}), 500


EXCEL_CELL_CHAR_LIMIT = 32767


def _at_excel_cell_limit(value, limit: int = EXCEL_CELL_CHAR_LIMIT) -> bool:
    """
    True if the given cell value is at (or above) Excel's per-cell character limit.
    We cast to str so this works for numbers, etc.
    """
    if value is None:
        return False
    try:
        text = str(value)
    except Exception:
        text = f"{value}"
    return len(text) >= limit


def _download_sp_file_to_upload(ctx, sp_file_path: str, original_filename: str) -> dict:
    """
    Download a SharePoint file (sp_file_path) into uploads/<uuid>/,
    normalize to uploads/<uuid>/document.pdf (converts if needed),
    and return {file_id, filename, page_count, file_stem}.
    """
    upload_id = str(uuid.uuid4())
    dest_dir = UPLOAD_ROOT / upload_id
    dest_dir.mkdir(parents=True, exist_ok=True)

    safe_name = secure_filename(original_filename) or "original"
    original_path = dest_dir / safe_name

    def _save_from_stream(file_stream):
        file_stream.seek(0)
        with open(original_path, "wb") as f:
            f.write(file_stream.read())
        return True

    try:
        # Downloads file and calls custom_function with a BytesIO
        sharepoint_import_excel(
            ctx,
            sp_file_path,
            sheet=None,
            custom_function=_save_from_stream
        )

        # Normalize/convert to document.pdf so the rest of the app behaves like /upload
        canonical_pdf = _ensure_pdf_in_folder(original_path, dest_dir)

        with open(str(canonical_pdf), "rb") as f:
            page_count = len(PdfReader(f).pages)

        return {
            "file_id": upload_id,
            "filename": original_filename,
            "page_count": page_count,
            "file_stem": Path(original_filename).stem,
        }
    except Exception:
        shutil.rmtree(dest_dir, ignore_errors=True)
        raise


@app.route("/api/init_from_sharepoint", methods=["POST"])
def init_from_sharepoint():
    """
    Initialise the frontend as if the user had:
      1) Uploaded a document via /upload
      2) Manually filled in the prompt fields.

    We:
      • Read the prompt cells from an Excel file on SharePoint.
      • Download the (PDF) file from SharePoint into UPLOAD_ROOT,
        convert/normalise it to uploads/<file_id>/document.pdf,
        and count pages exactly like /upload.
      • Return a response that matches FileUploadResponse + prompt fields.
    """
    try:
        data = request.get_json(force=True)

        # ---- 1. Basic parameters & defaults ---------------------------------
        folderName   = data.get("folderName")
        xlsxFilename = data.get("xlsxFilename")
        pdfFilename  = data.get("pdfFilename")
        sheet        = data.get("sheet")
        row          = data.get("row")
        column       = data.get("column")
        forceError   = data.get('forceError')
        if forceError:
            raise ValueError("Testing What happens when we force an error")

        if not (folderName and xlsxFilename):
            return jsonify({
                "success": False,
                "error": "folderName and xlsxFilename are required"
            }), 400

        # These defaults mirror the rest of your app
        siteName = data.get("siteName", "GADOpportunitiesandSolutions")
        tenant   = data.get("tenant", "tris42.onmicrosoft.com")
        client_id = data.get("client_id", "d44a05d5-c6a5-4bbb-82d2-443123722380")

        # Convert row/column to integers (assumed 0-based indices for iloc)
        try:
            #switch from 1 indexing in excel to 0 indexing in python
            row_idx = int(row)-1 if row is not None else 0
            col_idx = int(column)-1 if column is not None else 0
        except ValueError:
            return jsonify({
                "success": False,
                "error": "row and column must be integers"
            }), 400
        

        # ---- 2. Create SharePoint context -----------------------------------
        sp_site_url = f"https://tris42.sharepoint.com/sites/{siteName}/"
        ctx = sharepoint_create_context(sp_site_url, tenant, client_id)

        # Build file URLs/paths as used elsewhere in your app
        xlsx_filepath = folderName + "/" + xlsxFilename
        pdf_filepath  = folderName + "/" + pdfFilename
        print(f'row: {row}')
        print(f'column: {column}')
        print(f'row_idx: {row_idx}')
        print(f'xlsx filepath: {xlsx_filepath}')
        print(f'pdf filepath: {pdf_filepath}')
        

        # ---- 3. Read prompt slice from Excel --------------------------------
        try:
            custom_function = lambda x: pd.read_excel(x, sheet_name = sheet, header = None)
            df = sharepoint_import_excel(ctx, xlsx_filepath, custom_function = custom_function)

        except Exception as e:
            tb = traceback.format_exc()
            print("!" * 80)
            print("Error importing Excel from SharePoint in init_from_sharepoint")
            print(tb)
            return jsonify({
                "success": False,
                "error": f"Failed to import Excel from SharePoint: {e}"
            }), 500

        # We expect 5 consecutive rows: [role, task, context, format, constraints]
        try:
            slice_vals = df.iloc[row_idx:row_idx + 5, col_idx].tolist()
            print('slice_vals')
            print(slice_vals)
        except Exception as e:
            return jsonify({
                "success": False,
                "error": f"Failed to read prompt cells from Excel: {e}"
            }), 500

        # Ensure we always have 5 items, pad with empty strings if needed
        while len(slice_vals) < 5:
            slice_vals.append("")

        role_val        = slice_vals[0]
        context_val     = slice_vals[1]
        task_val        = slice_vals[2]
        format_val      = slice_vals[3]
        constraints_val = slice_vals[4]
        excel_limit_hits = {}
        for field_name, cell_value in {
            "role": role_val,
            "task": task_val,
            "context": context_val,
            "format": format_val,
            "constraints": constraints_val,
        }.items():
            # Excel truncates at exactly 32,767 characters; use >= for safety
            if _at_excel_cell_limit(cell_value, EXCEL_CELL_CHAR_LIMIT):
                excel_limit_hits[field_name] = len(str(cell_value))
        # ---- 4. Download PDF(s) from SharePoint into uploads/ ------------

        # Decide whether pdfFilename is a file or a folder.
        # If pdfFilename is missing, treat folderName as the folder of PDFs.
        pdf_target = pdfFilename  # may be None

        pdf_is_file = isinstance(pdf_target, str) and pdf_target.endswith('.pdf')

        # ---- Single file mode (backwards compatible) ----
        if pdf_is_file:
            sp_file_path = f"{folderName.rstrip('/')}/{pdf_target}".replace("//", "/")
            try:
                one = _download_sp_file_to_upload(ctx, sp_file_path, pdf_target)
            except Exception as e:
                tb = traceback.format_exc()
                print("!" * 80)
                print("Error downloading single PDF from SharePoint in init_from_sharepoint")
                print(tb)
                return jsonify({
                    "success": False,
                    "error": f"Failed to download PDF from SharePoint: {e}"
                }), 500

            page_count = one["page_count"]
            upload_id = one["file_id"]

            return jsonify({
                "success": True,
                "mode": "file",
                "pdf_file": {
                    "success": True,
                    "filename": normalize(one["filename"]),
                    "page_count": page_count,
                    "file_id": normalize(upload_id),
                },
                "prompt": {
                    "role":        normalize(role_val),
                    "task":        normalize(task_val),
                    "context":     normalize(context_val),
                    "format":      normalize(format_val),
                    "constraints": normalize(constraints_val),
                },
                "excel_limit_hits": excel_limit_hits,
            }), 200

        print('*' * 80)
        print('looks like pdf is a folder, so scanning the whole folder')
        # ---- Folder mode ----
        # Folder to scan:
        # - If pdfFilename was provided but isn't a file, interpret it as a subfolder name/path.
        # - Else scan folderName itself.
        if pdf_target:
            pdf_folder = f"{folderName.rstrip('/')}/{pdf_target}".replace("//", "/")
        else:
            pdf_folder = folderName.rstrip("/")

        # Ensure folder exists
        if not sharepoint_folder_exists(ctx, pdf_folder):
            return jsonify({
                "success": False,
                "error": f"PDF folder not found on SharePoint: {pdf_folder}"
            }), 404

        # List children and keep PDFs only
        children = list_children(ctx, pdf_folder)
        pdf_files = [f for f in children.get("files", []) if str(f.get("name", "")).lower().endswith(".pdf")]

        print('found these pdf_files: ')
        print(pdf_files)

        if not pdf_files:
            return jsonify({
                "success": False,
                "error": f"No PDF files found in SharePoint folder: {pdf_folder}"
            }), 404

        # Deterministic order
        pdf_files = sorted(pdf_files, key=lambda x: str(x.get("name", "")).lower())

        # Instead of downloading, return lightweight descriptors only.
        # (No page_count, no file_id yet.)
        pdf_files_light = []
        for f in pdf_files:
            name = f["name"]
            sp_file_path = f"{pdf_folder.rstrip('/')}/{name}".replace("//", "/")
            pdf_files_light.append({
                "success": True,
                "filename": normalize(name),
                "sp_file_path": normalize(sp_file_path),
                "length": normalize(f.get("length")),  # SharePoint-reported size (optional)
                "file_stem": normalize(Path(name).stem),
                # page_count intentionally omitted (requires downloading)
                # file_id intentionally omitted (created when prepared)
            })

        return jsonify({
            "success": True,
            "mode": "folder",
            "pdf_files": pdf_files_light,
            "pdf_folder": pdf_folder,
            "prompt": {
                "role":        normalize(role_val),
                "task":        normalize(task_val),
                "context":     normalize(context_val),
                "format":      normalize(format_val),
                "constraints": normalize(constraints_val),
            },
            "excel_limit_hits": excel_limit_hits,
        }), 200

    except Exception as e:
        tb = traceback.format_exc()
        print("!" * 80)
        print("Unhandled error in init_from_sharepoint")
        print(tb)
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route("/api/context", methods=["POST"])
def create_context():
    data = request.get_json(force=True)
    #in the frontend, we need to default to whatever you see here for the second argument
    #of hte `get`s
    site_url = data.get("site_url", "https://tris42.sharepoint.com/sites/GADOpportunitiesandSolutions")
    tenant = data.get("tenant", "tris42.onmicrosoft.com")
    client_id = data.get("client_id", "d44a05d5-c6a5-4bbb-82d2-443123722380")
    if not site_url:
        return jsonify({"error": "site_url is required"}), 400
    try:
        sharepoint_create_context(site_url, tenant=tenant, client_id=client_id)

        context_id = str(uuid.uuid4())
        _CONNECTIONS[context_id] = ConnectionInfo(site_url, tenant, client_id)
        return jsonify({"context_id": context_id})
    except Exception as e:
        tb = traceback.format_exc()
        print('!' * 80)
        print('error in create_context')
        print(tb)
        return jsonify({"error": str(tb)}), 500


@app.route("/api/folder/list")
def folder_list():
    context_id = request.args.get("context_id")
    folder = request.args.get('folder')
    if not (context_id and folder):
        return jsonify({"error": "context_id and folder are required"}), 400
    try:
        ctx = _new_ctx(context_id)
        if not sharepoint_folder_exists(ctx, folder):
            return jsonify({"error": "Folder not found"}), 404
        return jsonify(list_children(ctx, folder))
    except Exception as e:
        tb = traceback.format_exc()
        print('!' * 80)
        print('error in folder_list')
        print(tb)
        return jsonify({"error": str(e)}), 500


@app.route("/api/folder/tree")
def folder_tree():
    context_id = request.args.get("context_id")
    folder = request.args.get("folder")
    depth = int(request.args.get("depth", 2))
    if not (context_id and folder):
        return jsonify({"error": "context_id and folder are required"}), 400
    try:
        ctx = _new_ctx(context_id)
        if not sharepoint_folder_exists(ctx, folder):
            return jsonify({"error": "Folder not found"}), 404
        return jsonify(walk_tree(ctx, folder, depth))
    except Exception as e:
        tb = traceback.format_exc()
        print('!' * 80)
        print('error in folder_tree')
        print(tb)
        return jsonify({"error": str(e)}), 500


@app.route("/api/search")
def search_endpoint():
    context_id = request.args.get("context_id")
    folder = request.args.get("folder")
    query = request.args.get("q")
    depth = int(request.args.get("depth", 2))
    if not (context_id and folder and query):
        return jsonify({"error": "context_id, folder and q are required"}), 400
    try:
        ctx = _new_ctx(context_id)
        if not sharepoint_folder_exists(ctx, folder):
            return jsonify({"error": "Folder not found"}), 404
        return jsonify(search_tree(ctx, folder, query, depth))
    except Exception as e:
        tb = traceback.format_exc()
        print('!' * 80)
        print('error in search_endpoint')
        print(tb)
        return jsonify({"error": str(e)}), 500


@app.route("/api/folder/exists")
def folder_exists_endpoint():
    context_id = request.args.get("context_id")
    folder = request.args.get("folder")
    if not (context_id and folder):
        return jsonify({"error": "context_id and folder are required"}), 400
    try:
        ctx = _new_ctx(context_id)
        return jsonify({"exists": bool(sharepoint_folder_exists(ctx, folder))})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/file/exists")
def file_exists_endpoint():
    context_id = request.args.get("context_id")
    folder = request.args.get("folder")
    filename = request.args.get("filename")
    if not (context_id and folder and filename):
        return jsonify({"error": "context_id, folder and filename are required"}), 400
    try:
        ctx = _new_ctx(context_id)
        return jsonify({"exists": bool(sharepoint_file_exists(ctx, folder, filename))})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def count_document_pages(file_path, original_filename):
    """Count the number of pages in a document (PDF)"""
    file_ext = original_filename.rsplit('.', 1)[1].lower()

    try:
        if file_ext == 'pdf':
            # Count PDF pages using PyPDF2
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                return len(pdf_reader.pages)


    except Exception as e:
        print(f"Error counting pages: {e}")
        return 1



@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    if not file or not allowed_file(file.filename):
        return jsonify({
            'error':
            'Invalid file type. Only PDF files are allowed.'
        }), 400

    original_filename = secure_filename(file.filename)
    upload_id = str(uuid.uuid4())
    dest_dir = UPLOAD_ROOT / upload_id
    dest_dir.mkdir(parents=True, exist_ok=True)

    # Save original
    original_path = dest_dir / f"original{Path(original_filename).suffix.lower()}"
    file.save(str(original_path))

    try:
        converted_path = Path(str(original_path))

        # normalize it to document.pdf
        canonical_pdf = dest_dir / 'document.pdf'
        if converted_path.suffix.lower() == '.pdf' and converted_path.exists():
            # If LibreOffice wrote <basename>.pdf into dest_dir, move/rename it
            if converted_path != canonical_pdf:
                shutil.copy2(str(converted_path), str(canonical_pdf))
            pdf_path = canonical_pdf
        else:
            # Fallback: ensure PDF via _ensure_pdf_in_folder (does its own conversion/rename)
            pdf_path = _ensure_pdf_in_folder(original_path, dest_dir)
    except Exception as e:
        shutil.rmtree(dest_dir, ignore_errors=True)
        return jsonify({'error': f'Failed to convert file to PDF: {e}'}), 500

    # Count pages using the canonical PDF
    try:
        with open(str(pdf_path), 'rb') as f:
            page_count = len(PdfReader(f).pages)
    except Exception as e:
        shutil.rmtree(dest_dir, ignore_errors=True)
        return jsonify({'error': f'Failed to read PDF pages: {e}'}), 500

    return jsonify({
        'success': True,
        'filename': original_filename,
        'page_count': page_count,
        'file_id': upload_id
    })




# -----------------------------------------------------------------------------
# /process (modified to just initialize job)
# -----------------------------------------------------------------------------
@app.route('/process', methods=['POST'])
def process_document():
    data = request.get_json()
    print('*' * 80)
    print('[/process] Received new processing request')
    print(f'[/process] Data: {data}')

    # Extract form data
    role = data.get('role', '')
    task = data.get('task', '')
    context = data.get('context', '')
    format_field = data.get('format', '')
    constraints = data.get('constraints', '')
    model = (data.get('model') or 'gpt-4.1').lower()
    file_id = data.get('file_id', '')
    selected_pages = data.get('selected_pages', [])
    output_config = data.get('output_config', {'outputType': 'browser'})
    original_file_name = data.get('original_file_name')
    file_stem = data.get('file_stem')
    print('output_config received in process and saved to job:')
    print(output_config)

    # Validate inputs
    if not file_id:
        return jsonify({'success': False, 'error': 'file_id is required'}), 400
    if not isinstance(selected_pages, list) or not selected_pages:
        return jsonify({
            'success': False,
            'error': 'selected_pages must be a non-empty list'
        }), 400

    # Resolve canonical PDF up-front to fail fast if missing
    try:
        _ = _pdf_path_for_file_id(file_id)
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Could not resolve PDF: {e}'
        }), 400

    # Prepare prompts
    system_prompt = 'you are a helpful assistant'
    user_prompt = _compose_user_prompt(role, task, context, format_field, constraints)

    # Create job row in DB (NOT in RAM)
    job_id = str(uuid.uuid4())
    print(f'[/process] Created job {job_id} for file {file_id}')

    job_create = create_job(
        job_id=job_id,
        file_id=file_id,
        model=model,
        status="ready",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        selected_pages=selected_pages,
        output_config=output_config or {"outputType": "browser"},
        original_file_name=original_file_name,
        file_stem=file_stem,
    )

    if not job_create.get("success"):
        return jsonify({
            "success": False,
            "error": job_create.get("error", "Failed to create job in DB")
        }), 500

    # Create SQL table for page results
    try:
        create_page_results_table(job_id)
        print(f'[/process] Created page results table for job {job_id}')
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to create page results table: {e}'
        }), 500

    # Return job info for frontend to start processing pages
    return jsonify({
        'success': True,
        'message': 'Job initialized, ready to process pages',
        'job_id': job_id,
        'file_id': file_id,
        'pages_total': len(selected_pages),
        'selected_pages': sorted(selected_pages),
        'status': 'ready'
    }), 200


# -----------------------------------------------------------------------------
#  /process_page
# -----------------------------------------------------------------------------
@app.route('/process_page', methods=['POST'])
def process_page():
    data = request.get_json()
    job_id = data.get('job_id')
    original_file_name = data.get('original_file_name')
    page_number = data.get('page_number')
    
    if not job_id or page_number is None:
        return jsonify({'success': False, 'error': 'job_id and page_number are required'}), 400
    
    print(f'[/process_page] Processing page {page_number} for job {job_id}')
    
    # Load job from DB
    job_resp = get_job(job_id)
    if not job_resp.get("success"):
        return jsonify({"success": False, "error": job_resp.get("error", "Job not found")}), 404

    job = job_resp["job"]

    file_id = job.get("file_id")
    selected_pages = job.get("selected_pages", []) or []
    system_prompt = job.get("system_prompt")
    user_prompt = job.get("user_prompt")
    model = job.get("model")
    output_config = job.get("output_config") or {"outputType": "browser"}
    # keep original_file_name local too (used later)
    original_file_name = job.get("original_file_name")

    # Ensure processing_started_at is set in DB once
    ts_resp = touch_job_processing_started_at(job_id)
    processing_ts = ts_resp.get("processing_started_at") if ts_resp.get("success") else datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        # Resolve PDF path
        pdf_path = _pdf_path_for_file_id(file_id)
        
        page_num = int(page_number)

        # Rasterize exactly one page, and guarantee temp cleanup
        with rasterize_pdf_pages_to_temp_pngs(Path(pdf_path), [page_num], dpi=200) as img_paths:
            png_path = img_paths.get(page_num)

            if png_path is None or not png_path.exists():
                print(f'[/process_page] Page {page_num}: No image available')
                gpt_response = 'Page image not available'
                image_size_bytes = 0
            else:
                image_size_bytes = png_path.stat().st_size
                print(f'[/process_page] Page {page_num}: PNG size = {image_size_bytes:,} bytes')

                # Call GPT API
                if os.getenv('OPENAI_API_KEY') is None:
                    print(f'[/process_page] Page {page_num}: No API key found')
                    gpt_response = 'No API key found'
                else:
                    try:
                        import json
                        print(f'[/process_page] Page {page_num}: Calling GPT API with function calling')

                        raw_response = get_response_from_chatgpt_multiple_image_and_functions(
                            system_prompt=system_prompt,
                            user_prompt=user_prompt,
                            image_paths=[str(png_path)], 
                            model=model,
                            functions=get_markdown_schema(),
                            function_name='provide_markdown_response',
                            pre_compiled_images=None
                        )

                        print(f'[/process_page] Page {page_num}: GPT API call successful, parsing response')

                        try:
                            parsed = json.loads(raw_response)
                            gpt_response = parsed.get('markdown_response', raw_response)
                        except json.JSONDecodeError:
                            print(f'[/process_page] Page {page_num}: Failed to parse JSON, using raw response')
                            gpt_response = raw_response

                        print(f'[/process_page] Page {page_num}: Response extracted successfully')

                    except BadRequestError:
                        print(f'[/process_page] Page {page_num}: GPT refused to process')
                        gpt_response = 'GPT refused to process this page'
                    except Exception as e:
                        if 'timeout' in str(e).lower() or 'timed out' in str(e).lower():
                            print(f'[/process_page] Page {page_num}: GPT API timeout')
                            gpt_response = 'Timed out contacting GPT for this page'
                        else:
                            print(f'[/process_page] Page {page_num}: GPT API error: {e}')
                            gpt_response = f'Unable to get a response from GPT for this page: {e}'

        
        # Store result in SQL database
        append_page_result(job_id, int(page_number), gpt_response, image_size_bytes)
        print(f'[/process_page] Page {page_number}: Result stored in database')
        
        # Check if this is the last page (be robust to type mismatches / empty list)
        try:
            is_last_page = bool(selected_pages) and (int(page_number) == int(selected_pages[-1]))
        except Exception:
            is_last_page = False
        
        result = {
            'success': True,
            'job_id': job_id,
            'page': page_number,
            'gpt_response': gpt_response,
            'image_size_bytes': image_size_bytes,
            'is_last_page': is_last_page
        }
        
        # If last page, write CSV and delete table
        # If last page, either:
        #  - batch_mode: do NOT write XLSX yet (we'll finalize once all files finish)
        #  - normal: write XLSX now
        if is_last_page:
            batch_mode = bool((output_config or {}).get("batch_mode"))
            if batch_mode:
                result["note"] = "File completed (batch mode). Waiting for finalization."
                result["batch_mode"] = True
                return jsonify(result), 200
            print(f'[/process_page] Last page reached, writing CSV file')
            try:
                # Get all results from database
                all_results = get_all_page_results(job_id)
                
                if not all_results:
                    return jsonify({
                        'success': False,
                        'error': 'No results found in database'
                    }), 500
                
                # Create DataFrame
                df_raw = pd.DataFrame(all_results, columns=["page", "gpt_response"])

                TARGET_CHARS_PER_CHUNK = 26140

                def _safe_len(x) -> int:
                    try:
                        return len(x) if isinstance(x, str) else len(str(x))
                    except Exception:
                        return 0

                df_clean_list = []
                chunk_id = 1
                chunk_sum = 0

                for _, r in df_raw.iterrows():
                    text = r["gpt_response"]
                    text_len = _safe_len(text)

                    # Decide whether to start a new chunk BEFORE placing this row.
                    # If adding this row would exceed target, choose the closer of:
                    #   - end chunk now (distance = target - current_sum)
                    #   - include row (distance = (current_sum + len) - target)
                    # Always keep at least one row per chunk.
                    if chunk_sum > 0 and (chunk_sum + text_len) > TARGET_CHARS_PER_CHUNK:
                        dist_if_break = TARGET_CHARS_PER_CHUNK - chunk_sum
                        dist_if_keep  = (chunk_sum + text_len) - TARGET_CHARS_PER_CHUNK
                        if dist_if_break <= dist_if_keep:
                            chunk_id += 1
                            chunk_sum = 0

                    chunk_sum += text_len

                    df_clean_list.append({
                        "timestamp": processing_ts,
                        "chunk": chunk_id,
                        "Data reference": f"p_{original_file_name}",
                        "Brief description (optional)": f'Page {r["page"]}',
                        "Source (optional)": original_file_name,
                        "Data": text
                    })

                df = pd.DataFrame(df_clean_list)


                # ---- Hardening: clean text to avoid control chars / normalization issues ----
                _CTRL_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")  # keep \t \n \r

                def _clean_cell(x):
                    if isinstance(x, (bytes, bytearray)):
                        try:
                            x = x.decode('utf-8')
                        except Exception:
                            x = x.decode('utf-8', 'replace')
                    if isinstance(x, str):
                        x = unicodedata.normalize('NFC', x)
                        x = _CTRL_RE.sub('', x)
                    return x

                df = df.map(_clean_cell)
                # ---------------------------------------------------------------------------

                # Prefer Excel-friendly UTF-8 with BOM for widest compatibility
                ENCODING = 'utf-8-sig'

                # Handle output based on output_config
                out_type = (output_config or {}).get("outputType", "browser")
                fallback = False

                if out_type == "init_from_sharepoint":
                    print('[/process_page] init_from_sharepoint: Saving XLSX to SharePoint pdf_output subfolder')

                    # Required meta (frontend must send these when initialized from URL)
                    folder_name   = output_config.get("sharepointFolder")        # e.g. "/sites/.../Shared Documents/some/folder"
                    xlsx_filename = output_config.get("filename")      # e.g. "input.xlsx"
                    row_id        = output_config.get("row_id")            # required for naming
                    site_name     = output_config.get("siteName")
                    tenant        = "tris42.onmicrosoft.com"
                    client_id     = "d44a05d5-c6a5-4bbb-82d2-443123722380"

                    if not (folder_name and xlsx_filename and row_id):
                        # Fallback to browser if meta missing
                        print('[/process_page] init_from_sharepoint missing folderName/xlsxFilename/row_id; falling back to browser download')
                        out_type = "browser"
                        fallback = True
                    else:
                        # Build output folder + filename
                        xlsx_stem = Path(xlsx_filename).stem
                        sp_out_folder = f"{folder_name.rstrip('/')}/pdf_output".replace("//", "/")
                        sp_out_name = f"{xlsx_stem}_pdf_{row_id}.xlsx"

                        # Create SharePoint context (same style as init_from_sharepoint route)
                        sp_site_url = f"https://tris42.sharepoint.com/sites/{site_name}/"
                        ctx = sharepoint_create_context(sp_site_url, tenant, client_id)

                        # Ensure subfolder exists
                        sharepoint_create_folder(ctx, sp_out_folder)

                        # Convert df -> xlsx bytes and upload (overwrite)
                        xlsx_io = _df_to_xlsx_bytesio(df)
                        ok = _sharepoint_upload_bytes_overwrite(ctx, sp_out_folder, sp_out_name, xlsx_io)

                        if ok:
                            result["xlsx_filename"] = sp_out_name
                            result["xlsx_download_url"] = None
                            result["note"] = f"Uploaded to SharePoint: {sp_out_folder}/{sp_out_name}"
                        else:
                            print('[/process_page] init_from_sharepoint upload failed; falling back to browser download')
                            out_type = "browser"


                if out_type == "sharepoint":
                    print('[/process_page] Saving XLSX to SharePoint (explicit sharepoint mode)')
                    context_id = output_config.get('contextId')
                    sharepoint_folder = output_config.get('sharepointFolder')
                    filename = output_config.get('filename', 'output.xlsx')

                    if not filename.lower().endswith(".xlsx"):
                        filename = f"{Path(filename).stem}.xlsx"

                    if not (context_id and sharepoint_folder):
                        print('[/process_page] Missing SharePoint context or folder, falling back to browser output')
                        out_type = "browser"
                    else:
                        def _upload_to_sharepoint():
                            ctx = _new_ctx(context_id)
                            sharepoint_create_folder(ctx, sharepoint_folder)  # safe if exists
                            xlsx_io = _df_to_xlsx_bytesio(df)
                            return _sharepoint_upload_bytes_overwrite(ctx, sharepoint_folder, filename, xlsx_io)

                        try:
                            future = EXECUTOR.submit(_upload_to_sharepoint)
                            success = future.result(timeout=60)

                            if success:
                                result['xlsx_filename'] = filename
                                result['xlsx_download_url'] = None
                                result['note'] = "Uploaded XLSX to SharePoint"
                            else:
                                raise Exception("SharePoint upload returned False")
                        except Exception as sp_error:
                            print(f"SharePoint upload failed: {sp_error}, falling back to browser output")
                            out_type = "browser"


                if out_type == "browser":
                    # Save to local filesystem for browser download
                    print('[/process_page] Saving XLSX to local filesystem')
                    timestamp = datetime.now().strftime('%Y%m%dT%H%M%SZ')
                    xlsx_filename = secure_filename(f"gpt_responses_{timestamp}.xlsx")
                    upload_dir = UPLOAD_ROOT / file_id
                    xlsx_path = upload_dir / xlsx_filename
                    upload_dir.mkdir(parents=True, exist_ok=True)

                    xlsx_io = _df_to_xlsx_bytesio(df)
                    with open(xlsx_path, "wb") as f:
                        f.write(xlsx_io.getvalue())

                    print(f'[/process_page] XLSX saved to {xlsx_path}')
                    result['xlsx_filename'] = xlsx_filename
                    result['xlsx_download_url'] = f"/download/{file_id}/{xlsx_filename}"
                    result['fallback'] = fallback
                
                # Perform cleanup after result is prepared but before returning
                try:
                    print(f'[/process_page] Starting cleanup for job {job_id}')
                    delete_page_results_table(job_id)
                    delete_job(job_id)
                    print(f'[/process_page] Deleted page results table and job table for job {job_id}')
                except Exception as cleanup_error:
                    # Log but don't raise - cleanup failures shouldn't block CSV delivery
                    print(f'[/process_page] Warning: Cleanup failed for job {job_id}: {cleanup_error}')
                    traceback.print_exc()
                
            except Exception as e:
                print(f'[/process_page] Error writing CSV: {e}')
                return jsonify({
                    'success': False,
                    'error': f'Error writing CSV file: {e}'
                }), 500
        
        return jsonify(result), 200
        
    except Exception as e:
        tb = traceback.format_exc()
        print('!' * 80)
        print('error in /process_page')
        print(tb)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route("/api/finalize_batch", methods=["POST"])
def finalize_batch():
    """
    Combine results from multiple job_ids into ONE dataframe and output ONE XLSX.
    Adds an extra column "Filename stem".
    """
    try:
        data = request.get_json(force=True)
        job_ids = data.get("job_ids") or []
        output_config = data.get("output_config") or {"outputType": "browser"}

        if not isinstance(job_ids, list) or not job_ids:
            return jsonify({"success": False, "error": "job_ids must be a non-empty list"}), 400

        # Collect (file_stem, original_file_name, page, gpt_response) rows in job_ids order
        flat_rows = []
        processing_ts_candidates = []


        for jid in job_ids:
            job_resp = get_job(jid)
            job = job_resp.get("job") if job_resp.get("success") else {}
            file_stem = job.get("file_stem") or Path(job.get("original_file_name") or "").stem or jid[:8]
            original_file_name = job.get("original_file_name") or file_stem
            ts = job.get("processing_started_at")
            if ts:
                processing_ts_candidates.append(ts)

            all_results = get_all_page_results(jid)
            if not all_results:
                continue
            df_raw = pd.DataFrame(all_results)  # expects dicts with keys: page, gpt_response, image_size_bytes
            for _, r in df_raw.iterrows():
                flat_rows.append((file_stem, original_file_name, int(r["page"]), r["gpt_response"]))

        if not flat_rows:
            return jsonify({"success": False, "error": "No results found for provided job_ids"}), 500

        # Use earliest processing timestamp if available
        processing_ts = min(processing_ts_candidates) if processing_ts_candidates else datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ")

        TARGET_CHARS_PER_CHUNK = 26140

        def _safe_len(x) -> int:
            try:
                return len(x) if isinstance(x, str) else len(str(x))
            except Exception:
                return 0

        df_clean_list = []
        chunk_id = 1
        chunk_sum = 0

        for (file_stem, original_file_name, page, text) in flat_rows:
            text_len = _safe_len(text)

            if chunk_sum > 0 and (chunk_sum + text_len) > TARGET_CHARS_PER_CHUNK:
                dist_if_break = TARGET_CHARS_PER_CHUNK - chunk_sum
                dist_if_keep  = (chunk_sum + text_len) - TARGET_CHARS_PER_CHUNK
                if dist_if_break <= dist_if_keep:
                    chunk_id += 1
                    chunk_sum = 0

            chunk_sum += text_len

            df_clean_list.append({
                "timestamp": processing_ts,
                "chunk": chunk_id,
                "Filename stem": file_stem,
                "Data reference": f"p_{original_file_name}",
                "Brief description (optional)": f"Page {page}",
                "Source (optional)": original_file_name,
                "Data": text
            })

        df = pd.DataFrame(df_clean_list)

        # ---- Clean text to avoid control chars / normalization issues ----
        import unicodedata, re as _re
        _CTRL_RE = _re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")  # keep \t \n \r

        def _clean_cell(x):
            if isinstance(x, (bytes, bytearray)):
                try:
                    x = x.decode('utf-8')
                except Exception:
                    x = x.decode('utf-8', 'replace')
            if isinstance(x, str):
                x = unicodedata.normalize('NFC', x)
                x = _CTRL_RE.sub('', x)
            return x

        df = df.map(_clean_cell)
        # -----------------------------------------------------------------

        out_type = (output_config or {}).get("outputType", "browser")
        fallback = False
        result = {"success": True}

        if out_type == "init_from_sharepoint":
            folder_name   = output_config.get("sharepointFolder")
            xlsx_filename = output_config.get("filename")
            row_id        = output_config.get("row_id")
            site_name     = output_config.get("siteName")
            tenant        = "tris42.onmicrosoft.com"
            client_id     = "d44a05d5-c6a5-4bbb-82d2-443123722380"

            if not (folder_name and xlsx_filename and row_id and site_name):
                out_type = "browser"
                fallback = True
            else:
                xlsx_stem = Path(xlsx_filename).stem
                sp_out_folder = f"{folder_name.rstrip('/')}/pdf_output".replace("//", "/")
                sp_out_name = f"{xlsx_stem}_pdf_{row_id}.xlsx"

                sp_site_url = f"https://tris42.sharepoint.com/sites/{site_name}/"
                ctx = sharepoint_create_context(sp_site_url, tenant, client_id)

                sharepoint_create_folder(ctx, sp_out_folder)
                xlsx_io = _df_to_xlsx_bytesio(df)
                ok = _sharepoint_upload_bytes_overwrite(ctx, sp_out_folder, sp_out_name, xlsx_io)

                if ok:
                    result["xlsx_filename"] = sp_out_name
                    result["xlsx_download_url"] = None
                    result["note"] = f"Uploaded to SharePoint: {sp_out_folder}/{sp_out_name}"
                else:
                    out_type = "browser"
                    fallback = True

        if out_type == "sharepoint":
            context_id = output_config.get('contextId')
            sharepoint_folder = output_config.get('sharepointFolder')
            filename = output_config.get('filename', 'output.xlsx')

            if not filename.lower().endswith(".xlsx"):
                filename = f"{Path(filename).stem}.xlsx"

            if not (context_id and sharepoint_folder):
                out_type = "browser"
                fallback = True
            else:
                def _upload_to_sharepoint():
                    ctx = _new_ctx(context_id)
                    sharepoint_create_folder(ctx, sharepoint_folder)
                    xlsx_io = _df_to_xlsx_bytesio(df)
                    return _sharepoint_upload_bytes_overwrite(ctx, sharepoint_folder, filename, xlsx_io)

                try:
                    future = EXECUTOR.submit(_upload_to_sharepoint)
                    success = future.result(timeout=60)
                    if success:
                        result["xlsx_filename"] = filename
                        result["xlsx_download_url"] = None
                        result["note"] = "Uploaded XLSX to SharePoint"
                    else:
                        out_type = "browser"
                        fallback = True
                except Exception:
                    out_type = "browser"
                    fallback = True

        if out_type == "browser":
            batch_id = str(uuid.uuid4())
            timestamp = datetime.now().strftime('%Y%m%dT%H%M%SZ')
            xlsx_filename = secure_filename(f"gpt_responses_batch_{timestamp}.xlsx")
            out_dir = UPLOAD_ROOT / batch_id
            out_dir.mkdir(parents=True, exist_ok=True)
            xlsx_path = out_dir / xlsx_filename

            xlsx_io = _df_to_xlsx_bytesio(df)
            with open(xlsx_path, "wb") as f:
                f.write(xlsx_io.getvalue())

            result["xlsx_filename"] = xlsx_filename
            result["xlsx_download_url"] = f"/download/{batch_id}/{xlsx_filename}"
            result["fallback"] = fallback

        # Cleanup all job tables now that we've produced the combined output
        for jid in job_ids:
            try:
                delete_page_results_table(jid)
            except Exception:
                traceback.print_exc()
            try:
                delete_job(jid)
            except Exception:
                traceback.print_exc()

        return jsonify(result), 200

    except Exception as e:
        tb = traceback.format_exc()
        print("!" * 80)
        print("Unhandled error in finalize_batch")
        print(tb)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/feedback", methods=["POST"])
def api_submit_feedback():
    try:
        data = request.get_json(force=True) or {}

        name = (data.get("name") or "").strip()
        comment = (data.get("comment") or "").strip()
        meta = data.get("meta") or {}

        resp = save_feedback(
            name=name,
            comment=comment,
            meta=meta,
        )

        if resp.get("success"):
            return jsonify(resp), 201

        # Validation / expected failure
        return jsonify(resp), 400

    except Exception as e:
        tb = traceback.format_exc()
        print("!" * 80)
        print("Error in /api/feedback")
        print(tb)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/ping")
def ping():
    return jsonify({"status": "ok"})


@app.route("/api/prompts/save", methods=["POST"])
def api_save_prompt():
    """Save a new prompt configuration."""
    try:
        data = request.get_json(force=True)
        
        required_fields = ["name", "role", "task", "context", "format", "constraints"]
        for field in required_fields:
            if field not in data:
                return jsonify({"success": False, "error": f"Missing field: {field}"}), 400
        
        result = save_prompt(
            name=data["name"],
            description=data.get("description", ""),
            role_prompt=data["role"],
            task_prompt=data["task"],
            context_prompt=data["context"],
            format_prompt=data["format"],
            constraints_prompt=data["constraints"],
            created_by=data.get("created_by"),
            tags=data.get("tags")
        )
        
        if result["success"]:
            return jsonify(result), 201
        else:
            return jsonify(result), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/prompts/search", methods=["GET"])
def api_search_prompts():
    """Search for saved prompts."""
    try:
        search_text = request.args.get("search_text")
        search_in = request.args.get("search_in", "both")
        tags = request.args.get("tags")
        created_by = request.args.get("created_by")
        limit = int(request.args.get("limit", 100))
        
        search_fields_str = request.args.get("search_fields")
        search_fields = search_fields_str.split(",") if search_fields_str else None
        
        date_operator = request.args.get("date_operator")
        date_value = request.args.get("date_value")
        date_value_end = request.args.get("date_value_end")
        
        result = search_prompts(
            search_text=search_text,
            search_in=search_in,
            search_fields=search_fields,
            tags=tags,
            created_by=created_by,
            date_operator=date_operator,
            date_value=date_value,
            date_value_end=date_value_end,
            limit=limit
        )
        
        if result["success"]:
            return jsonify(result), 200
        else:
            return jsonify(result), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/prompts/<int:prompt_id>", methods=["GET"])
def api_get_prompt(prompt_id):
    """Get a specific prompt by ID."""
    try:
        result = get_prompt_by_id(prompt_id)
        
        if result["success"]:
            return jsonify(result), 200
        else:
            return jsonify(result), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/prompts/<int:prompt_id>", methods=["DELETE"])
def api_delete_prompt(prompt_id):
    """Delete a prompt by ID."""
    try:
        result = delete_prompt(prompt_id)
        
        if result["success"]:
            return jsonify(result), 200
        else:
            return jsonify(result), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/")
def root():
    return app.send_static_file("index.html")


DEVELOPMENT = 'rida_apps_development' in str(BASE_DIR)

try:
    if str(BASE_DIR).find('stgadfileshare001') != -1:
        print('Running in stgadfileshare001 environment')
        HOST = '0.0.0.0'
        if DEVELOPMENT:
            PORT = 8326
        else:
            PORT = 8316
    else:
        print('Running in local environment')
        HOST = 'localhost'
        PORT = 8000
except Exception as e:
    print(f'error: {e}')
    HOST = '0.0.0.0'
    PORT = 8000


if __name__ == '__main__':
    app.run(debug=False, host=HOST, port=PORT)
