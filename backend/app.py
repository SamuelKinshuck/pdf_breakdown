from flask_cors import CORS
import os
from werkzeug.utils import secure_filename
import PyPDF2
from docx import Document
from pptx import Presentation

import sys
from pathlib import Path

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
from backend.gpt_interface import get_response_from_chatgpt_image

import uuid
from typing import List, Dict
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

from dataclasses import dataclass
import time
from typing import Any
from backend.jobstate import JobState
import traceback

# ---- Import your existing utilities -----------------------------------------
from backend.sharepoint import (
    sharepoint_create_context,
    sharepoint_folder_exists,
    sharepoint_file_exists,
    sharepoint_export_df_to_csv,
    sharepoint_delete_file_by_path
)
from backend.database import (
    save_prompt,
    search_prompts,
    get_prompt_by_id,
    delete_prompt
)

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


_JOBS: Dict[str, dict] = {}
_JOBS_LOCK = threading.Lock()

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
UPLOAD_ROOT = BASE_DIR / 'uploads'


def _images_from_df_path(pdf_path: str,
                         selected_pages: List[int]) -> Dict[int, str]:
    from PIL import Image
    import io
    
    print(f"[_images_from_df_path] Starting image generation for {len(selected_pages)} pages from {pdf_path}")
    doc = None
    try:
        doc = fitz.open(pdf_path)
        page_images_for_gpt = {}
        MAX_DIM = 1200
        for page_num in range(len(doc)):
            page_number = page_num + 1
            if page_number not in selected_pages:
                continue
            try:
                print(f"[_images_from_df_path] Rendering page {page_number}...")
                page = doc[page_num]
                rect = page.rect
                scale = min(MAX_DIM / max(rect.width, rect.height), 2)
                m = fitz.Matrix(scale, scale)
                pix = page.get_pixmap(matrix=m, alpha=False)
                
                # Convert to PIL Image for JPEG compression with quality control
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                
                # Save as JPEG with quality setting
                buffer = io.BytesIO()
                img.save(buffer, format="JPEG", quality=60, optimize=True, progressive=True)
                img_bytes = buffer.getvalue()
                
                base64_encoded = base64.b64encode(img_bytes).decode('utf-8')
                data_url = f"data:image/jpeg;base64,{base64_encoded}"
                page_images_for_gpt[page_number] = data_url
                print(f"[_images_from_df_path] Page {page_number} rendered successfully ({len(base64_encoded)} bytes)")
            except Exception as e:
                print(f"[_images_from_df_path] Error rasterizing page {page_number}: {e}")
                page_images_for_gpt[page_number] = None
        print(f"[_images_from_df_path] Completed image generation for {len(page_images_for_gpt)} pages")
        return page_images_for_gpt
    finally:
        # Always close the PDF document to avoid file handle leaks
        if doc is not None:
            doc.close()
            print(f"[_images_from_df_path] PDF document closed")


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
UPLOAD_FOLDER = 'uploads'
# Configuration
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'pptx'}
app.config['UPLOAD_FOLDER'] = str(UPLOAD_ROOT)

# Ensure root exists
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

# Create upload directory if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def allowed_file(filename):
    return '.' in filename and filename.rsplit(
        '.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/download/<path:filename>', methods=['GET'])
def download(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'],
                               filename,
                               as_attachment=True)



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

def convert_to_pdf(file_path, original_filename):
    """Convert docx or pptx files to PDF and return the PDF path"""
    file_ext = original_filename.rsplit('.', 1)[1].lower()

    if file_ext == 'pdf':
        return file_path

    # Convert DOCX/PPTX to PDF using LibreOffice headless
    if file_ext in ['docx', 'pptx']:
        try:
            # Create output directory
            output_dir = os.path.dirname(file_path)

            # Use LibreOffice to convert to PDF
            result = subprocess.run([
                'soffice', '--headless', '--convert-to', 'pdf', '--outdir',
                output_dir, file_path
            ],
                                    capture_output=True,
                                    text=True,
                                    timeout=30)

            if result.returncode == 0:
                # Generate PDF filename
                base_name = os.path.splitext(original_filename)[0]
                pdf_filename = f"{base_name}.pdf"
                pdf_path = os.path.join(output_dir, pdf_filename)

                if os.path.exists(pdf_path):
                    return pdf_path
                else:
                    print(
                        f"PDF conversion succeeded but file not found: {pdf_path}"
                    )
                    return file_path
            else:
                print(f"LibreOffice conversion failed: {result.stderr}")
                return file_path
        except subprocess.TimeoutExpired:
            print("LibreOffice conversion timed out")
            return file_path
        except Exception as e:
            print(f"Error converting file: {e}")
            return file_path

    return file_path


def count_document_pages(file_path, original_filename):
    """Count the number of pages in a document (PDF, DOCX, or PPTX)"""
    file_ext = original_filename.rsplit('.', 1)[1].lower()

    try:
        if file_ext == 'pdf':
            # Count PDF pages using PyPDF2
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                return len(pdf_reader.pages)

        elif file_ext == 'docx':
            # Count DOCX pages (approximation based on content)
            doc = Document(file_path)
            # This is an approximation - actual page count depends on formatting
            # For a more accurate count, we'd need to convert to PDF first
            paragraphs = len(doc.paragraphs)
            # Rough estimate: 25-30 paragraphs per page
            estimated_pages = max(1, (paragraphs + 25) // 30)
            return estimated_pages

        elif file_ext == 'pptx':
            # Count PPTX slides
            prs = Presentation(file_path)
            return len(prs.slides)

        else:
            return 1

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
            'Invalid file type. Only PDF, DOCX, and PPTX files are allowed.'
        }), 400

    original_filename = secure_filename(file.filename)
    upload_id = str(uuid.uuid4())
    dest_dir = UPLOAD_ROOT / upload_id
    dest_dir.mkdir(parents=True, exist_ok=True)

    # Save original
    original_path = dest_dir / f"original{Path(original_filename).suffix.lower()}"
    file.save(str(original_path))

    # Try your convert_to_pdf() first
    try:
        converted_path = convert_to_pdf(str(original_path), original_filename)
        converted_path = Path(converted_path)

        # If conversion actually yielded a PDF file that exists, normalize it to document.pdf
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
# Helpers for async jobs
# -----------------------------------------------------------------------------
def _now_iso() -> str:
    return datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ")

def _init_job_state(job_id: str,
                    file_id: str,
                    selected_pages: List[int],
                    model: str) -> dict:
    # Keep the structure simple and serializable
    return {
        "job_id": job_id,
        "file_id": file_id,
        "model": model,
        "status": "queued",                # queued | running | completed | error
        "error": None,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "started_at": None,
        "finished_at": None,
        "pages_total": len(selected_pages),
        "selected_pages": sorted(selected_pages),
        "pages_done": 0,
        "last_page": None,
        "rows": [],                        # list[{"page": int, "gpt_response": str}]
        "csv_filename": None,
        "csv_download_url": None,
    }

def _save_job(job_id: str, update: dict):
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
        if job is None:
            return
        if job.get("status") in ("completed", "error") and update.get("status") not in ("completed", "error"):
            return
        job.update(update)
        job["updated_at"] = _now_iso()

def _run_process_job(job_id: str,
                     file_id: str,
                     selected_pages: List[int],
                     system_prompt: str,
                     user_prompt: str,
                     model: str,
                     output_config: dict = None) -> None:
    """
    Background worker that does the actual page-by-page processing and updates
    the _JOBS[job_id] state so /process_poll can report progress.
    """
    if output_config is None:
        output_config = {'outputType': 'browser'}
    
    print(f"[_run_process_job] Job {job_id} started for file {file_id}")
    # Mark job as running
    _save_job(job_id, {"status": "running", "started_at": _now_iso()})

    try:
        # Resolve PDF + prep images in the worker (keeps main request snappy)
        print(f"[_run_process_job] Resolving PDF path for file {file_id}")
        pdf_path = _pdf_path_for_file_id(file_id)
        print(f"[_run_process_job] PDF path resolved: {pdf_path}")
        
        # Generate images from PDF
        print(f"[_run_process_job] Starting image generation...")
        images_for_gpt = _images_from_df_path(pdf_path, selected_pages)
        print(f"[_run_process_job] Image generation completed successfully")

        pages_in_order = sorted([p for p in selected_pages if p in images_for_gpt])
        print(f"[_run_process_job] Processing {len(pages_in_order)} pages in order: {pages_in_order}")

        rows: List[Dict[str, Any]] = []
        for idx, page_no in enumerate(pages_in_order, start=1):
            print(f"[_run_process_job] Starting page {page_no} ({idx}/{len(pages_in_order)})")
            # Mark page as in progress
            _save_job(job_id, {
                "pages_done": idx - 1,
                "last_page": page_no,
                "page_status": {"page": page_no, "state": "in_progress"}
            })
            
            pre_compiled_image = images_for_gpt.get(page_no)
            if pre_compiled_image is None:
                print(f"[_run_process_job] Page {page_no}: No image available")
                rows.append({"page": page_no, "gpt_response": "Page image not available", "image_size_bytes": 0})
                _save_job(job_id, {
                    "pages_done": idx,
                    "last_page": page_no,
                    "rows": sorted(rows, key=lambda r: r["page"]),
                    "page_status": {"page": page_no, "state": "completed"}
                })
                continue

            # Calculate the size of the image data being sent to GPT
            image_size_bytes = len(pre_compiled_image)
            print(f"[_run_process_job] Page {page_no}: Image size = {image_size_bytes:,} bytes ({image_size_bytes / 1024:.2f} KB)")

            # Do the GPT call
            if os.getenv('OPENAI_API_KEY') is None:
                print(f"[_run_process_job] Page {page_no}: No API key found")
                response = 'No API key found'
            else:
                try:
                    print(f"[_run_process_job] Page {page_no}: Calling GPT API ")
                    response = get_response_from_chatgpt_image(
                        system_prompt=system_prompt,
                        user_prompt=user_prompt,
                        image_path=None,
                        model=model,
                        pre_compiled_image=pre_compiled_image
                    )
                    print(f"[_run_process_job] Page {page_no}: GPT API call successful")
                except BadRequestError:
                    print(f"[_run_process_job] Page {page_no}: GPT refused to process")
                    response = 'GPT refused to process this page'
                except Exception as e:
                    if 'timeout' in str(e).lower() or 'timed out' in str(e).lower():
                        print(f"[_run_process_job] Page {page_no}: GPT API timeout")
                        response = 'Timed out contacting GPT for this page'
                    else:
                        print(f"[_run_process_job] Page {page_no}: GPT API error: {e}")
                        response = f'Unable to get a response from GPT for this page: {e}'

            rows.append({"page": page_no, "gpt_response": response, "image_size_bytes": image_size_bytes})
            time.sleep(10)

            # Update incremental progress
            _save_job(job_id, {
                "pages_done": idx,
                "last_page": page_no,
                "rows": sorted(rows, key=lambda r: r["page"]),
                "page_status": {"page": page_no, "state": "completed"}
            })
            print(f"[_run_process_job] Page {page_no} completed ({idx}/{len(pages_in_order)})")

        # If nothing processed, mark and bail
        if not rows:
            print(f"[_run_process_job] No rows processed, marking as error")
            _save_job(job_id, {
                "status": "error",
                "error": "Could not find selected pages to process.",
                "finished_at": _now_iso()
            })
            return

        # Create DataFrame
        print(f"[_run_process_job] Creating DataFrame with {len(rows)} rows")
        df = pd.DataFrame(sorted(rows, key=lambda r: r["page"]), columns=["page", "gpt_response"])
        
        # Handle output based on output_config
        if output_config.get('outputType') == 'sharepoint':
            print(f"[_run_process_job] Saving to SharePoint")
            # Save to SharePoint
            context_id = output_config.get('contextId')
            sharepoint_folder = output_config.get('sharepointFolder')
            filename = output_config.get('filename', 'output.csv')
            
            if context_id and sharepoint_folder:
                def _upload_to_sharepoint():
                    ctx = _new_ctx(context_id)
                    return sharepoint_export_df_to_csv(ctx, sharepoint_folder, filename, df)
                
                try:
                    future = EXECUTOR.submit(_upload_to_sharepoint)
                    success = future.result(timeout=60)
                    
                    if success:
                        _save_job(job_id, {
                            "status": "completed",
                            "finished_at": _now_iso(),
                            "csv_filename": filename,
                            "csv_download_url": None,
                        })
                    else:
                        raise Exception("Failed to upload to SharePoint")
                except FuturesTimeout:
                    print("SharePoint upload timed out, falling back to browser output")
                    timestamp = datetime.now().strftime('%Y%m%dT%H%M%SZ')
                    csv_filename = secure_filename(f"gpt_responses_{timestamp}.csv")
                    upload_dir = UPLOAD_ROOT / file_id
                    csv_path = upload_dir / csv_filename
                    df.to_csv(str(csv_path), index=False)
                    _save_job(job_id, {
                        "status": "completed",
                        "finished_at": _now_iso(),
                        "csv_filename": csv_filename,
                        "csv_download_url": f"/download/{file_id}/{csv_filename}",
                        "error": "SharePoint upload timed out, saved locally instead"
                    })
                    return
                except Exception as sp_error:
                    print(f"SharePoint upload error: {sp_error}")
                    _save_job(job_id, {
                        "status": "error",
                        "error": f"Failed to save to SharePoint: {sp_error}",
                        "finished_at": _now_iso(),
                    })
                    return
            else:
                _save_job(job_id, {
                    "status": "error",
                    "error": "Missing SharePoint context or folder",
                    "finished_at": _now_iso(),
                })
                return
        else:
            # Save to local filesystem for browser download
            print(f"[_run_process_job] Saving to local filesystem")
            timestamp = datetime.now().strftime('%Y%m%dT%H%M%SZ')
            csv_filename = secure_filename(f"gpt_responses_{timestamp}.csv")
            upload_dir = UPLOAD_ROOT / file_id
            csv_path = upload_dir / csv_filename
            df.to_csv(str(csv_path), index=False)
            print(f"[_run_process_job] CSV saved to {csv_path}")

            # Mark job complete
            _save_job(job_id, {
                "status": "completed",
                "finished_at": _now_iso(),
                "csv_filename": csv_filename,
                "csv_download_url": f"/download/{file_id}/{csv_filename}",
            })
            print(f"[_run_process_job] Job {job_id} completed successfully")

    except Exception as e:
        # Capture traceback for debugging
        tb = traceback.format_exc()
        print('!' * 80)
        print('error in _run_process_job')
        print(tb)

        _save_job(job_id, {
            "status": "error",
            "error": f"{e}",
            "finished_at": _now_iso(),
        })


# -----------------------------------------------------------------------------
# DROP-IN REPLACEMENT: /process (now asynchronous)
# -----------------------------------------------------------------------------
@app.route('/process', methods=['POST'])
def process_document():
    data = request.get_json()
    print('*' * 80)
    print('[/process] Received new processing request')
    print(f'[/process] Data: {data}')

    # Extract the same form data as before
    role = data.get('role', '')
    task = data.get('task', '')
    context = data.get('context', '')
    format_field = data.get('format', '')
    constraints = data.get('constraints', '')
    model = (data.get('model') or 'gpt-4.1').lower()
    file_id = data.get('file_id', '')
    selected_pages = data.get('selected_pages', [])
    output_config = data.get('output_config', {'outputType': 'browser'})

    # Validate inputs (same constraints as before)
    if not file_id:
        return jsonify({'success': False, 'error': 'file_id is required'}), 400
    if not isinstance(selected_pages, list) or not selected_pages:
        return jsonify({
            'success': False,
            'error': 'selected_pages must be a non-empty list'
        }), 400

    # Resolve canonical PDF up-front only to fail fast if missing
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

    # Create a job and kick off a worker thread
    job_id = str(uuid.uuid4())
    print(f'[/process] Created job {job_id} for file {file_id}')
    state = _init_job_state(job_id, file_id, selected_pages, model)
    state['output_config'] = output_config
    with _JOBS_LOCK:
        _JOBS[job_id] = state  # type: ignore[assignment]
        print(f'[/process] Active jobs: {len(_JOBS)}')

    worker = threading.Thread(
        target=_run_process_job,
        args=(job_id, file_id, selected_pages, system_prompt, user_prompt, model, output_config),
        daemon=True
    )
    worker.start()
    print(f'[/process] Worker thread started for job {job_id}')

    # Immediate response so the client can poll for status and partial results
    return jsonify({
        'success': True,
        'message': 'Processing started',
        'job_id': job_id,
        'file_id': file_id,
        'pages_total': len(selected_pages),
        'selected_pages': sorted(selected_pages),
        'status': 'queued',
        'poll_url': f"/process_poll?job_id={job_id}"
    }), 202


# -----------------------------------------------------------------------------
# NEW ENDPOINT: /process_poll
# Reports progress + partial results in an orderly list of dicts
# -----------------------------------------------------------------------------
@app.route('/process_poll', methods=['GET'])
def process_poll():
    job_id = request.args.get('job_id')
    if not job_id:
        return jsonify({'success': False, 'error': 'job_id is required'}), 400

    with _JOBS_LOCK:
        state = _JOBS.get(job_id)
        if state is None:
            return jsonify({'success': False, 'error': 'job not found'}), 404
        # shallow copy whole dict + rows list for a stable snapshot
        snap = dict(state)
        snap_rows = list(snap.get("rows", []))
    
    # Check for stalled jobs
    STALE_SECS = 180
    if snap.get('status') == 'running':
        try:
            from datetime import timezone
            last = datetime.strptime(snap['updated_at'], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            if (datetime.now(timezone.utc) - last).total_seconds() > STALE_SECS:
                _save_job(snap['job_id'], {"status": "error", "error": "Worker stalled - no progress for 3 minutes"})
                snap['status'] = 'error'
                snap['error'] = 'Worker stalled - no progress for 3 minutes'
        except Exception:
            pass

    rows_ordered = sorted(snap_rows, key=lambda r: r.get("page", 0))
    payload = {
        'success': True,
        'job_id': snap.get('job_id'),
        'file_id': snap.get('file_id'),
        'status': snap.get('status'),
        'error': snap.get('error'),
        'created_at': snap.get('created_at'),
        'updated_at': snap.get('updated_at'),
        'started_at': snap.get('started_at'),
        'finished_at': snap.get('finished_at'),
        'pages_total': snap.get('pages_total'),
        'pages_done': snap.get('pages_done'),
        'last_page': snap.get('last_page'),
        'page_status': snap.get('page_status'),
        'responses': rows_ordered,
        'csv_filename': snap.get('csv_filename'),
        'csv_download_url': snap.get('csv_download_url'),
    }
    return jsonify(payload), 200



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


try:
    if os.getenv('REPL_ID') or os.getenv('REPLIT_DEV_DOMAIN'):
        print('Running in Replit environment')
        HOST = '0.0.0.0'
        PORT = 8000
    elif str(BASE_DIR).find('stgadfileshare001') != -1:
        print('Running in stgadfileshare001 environment')
        HOST = '0.0.0.0'
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
