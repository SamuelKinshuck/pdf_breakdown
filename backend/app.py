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
    sharepoint_delete_file_by_path
)
from backend.database import (
    save_prompt,
    search_prompts,
    get_prompt_by_id,
    delete_prompt,
    create_page_results_table,
    append_page_result,
    get_all_page_results,
    delete_page_results_table
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


import tempfile
def pdf_pages_to_images(pdf_path: Path, selected_pages: List, dpi: int = 200) -> List[Path]:
    doc = fitz.open(pdf_path)
    scale = dpi / 72
    mtx = fitz.Matrix(scale, scale)
    tmp = Path(tempfile.mkdtemp(prefix=f"{pdf_path.stem}_"))
    paths: Dict[int, Path] = {}
    for i, page in enumerate(doc):
        if (i + 1) in selected_pages:
            pix = page.get_pixmap(matrix=mtx)  # PNG by default with .save(...)
            out = tmp / f"page_{i:04d}.png"
            pix.save(out)                      # writes PNG bytes
            _ensure_png_size(out)              # <-- use the PNG version
            paths[i+1] = out
    doc.close()
    return paths

def _images_from_df_path(pdf_path: str,
                         selected_pages: List[int]) -> Dict[int, str]:
    import tempfile, base64
    from pathlib import Path
    print(f"[_images_from_df_path] Starting image generation for {len(selected_pages)} pages from {pdf_path}")
    doc = None
    temp_dir = None
    try:
        doc = fitz.open(pdf_path)
        max_page = len(doc)
        pages_to_render = [p for p in selected_pages if 1 <= p <= max_page]
        temp_dir = Path(tempfile.mkdtemp(prefix=f"{Path(pdf_path).stem}_"))

        dpi = 72
        scale = dpi / 72
        mtx = fitz.Matrix(scale, scale)

        page_images_for_gpt: Dict[int, str] = {}

        for page_number in pages_to_render:
            try:
                print(f"[_images_from_df_path] Rendering page {page_number}...")
                page = doc[page_number - 1]
                pix = page.get_pixmap(matrix=mtx)

                png_path = temp_dir / f"page_{page_number:04d}.png"
                pix.save(str(png_path))                 # keep PNG
                _ensure_png_size(png_path)              # enforce size as PNG

                with open(png_path, "rb") as image_file:
                    b64 = base64.b64encode(image_file.read()).decode("utf-8")
                data_url = f"data:image/png;base64,{b64}"  # <-- PNG mime

                page_images_for_gpt[page_number] = data_url
                print(f"[_images_from_df_path] Page {page_number} rendered successfully (base64 chars: {len(b64)})")
            except Exception as e:
                print(f"[_images_from_df_path] Error rasterizing page {page_number}: {e}")
                page_images_for_gpt[page_number] = None

        print(f"[_images_from_df_path] Completed image generation for {len(page_images_for_gpt)} pages")
        return page_images_for_gpt
    finally:
        if doc is not None:
            doc.close()
            print(f"[_images_from_df_path] PDF document closed")
        if temp_dir and temp_dir.exists():
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)
            print(f"[_images_from_df_path] Cleaned up temporary directory")


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

    # Create job state
    job_id = str(uuid.uuid4())
    print(f'[/process] Created job {job_id} for file {file_id}')
    state = _init_job_state(job_id, file_id, selected_pages, model)
    state['output_config'] = output_config
    state['system_prompt'] = system_prompt
    state['user_prompt'] = user_prompt
    state['status'] = 'ready'
    
    with _JOBS_LOCK:
        _JOBS[job_id] = state
        print(f'[/process] Active jobs: {len(_JOBS)}')

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
# NEW ENDPOINT: /process_page
# -----------------------------------------------------------------------------
@app.route('/process_page', methods=['POST'])
def process_page():
    data = request.get_json()
    job_id = data.get('job_id')
    page_number = data.get('page_number')
    
    if not job_id or page_number is None:
        return jsonify({'success': False, 'error': 'job_id and page_number are required'}), 400
    
    print(f'[/process_page] Processing page {page_number} for job {job_id}')
    
    # Get job state
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
        if not job:
            return jsonify({'success': False, 'error': 'Job not found'}), 404
        
        file_id = job.get('file_id')
        selected_pages = job.get('selected_pages', [])
        system_prompt = job.get('system_prompt')
        user_prompt = job.get('user_prompt')
        model = job.get('model')
        output_config = job.get('output_config', {'outputType': 'browser'})
    
    try:
        # Resolve PDF path
        pdf_path = _pdf_path_for_file_id(file_id)
        
        # Generate image for this specific page
        img_paths = pdf_pages_to_images(Path(pdf_path), [int(page_number)])
        images_for_gpt = _images_from_df_path(pdf_path, [page_number])
        pre_compiled_image = images_for_gpt.get(page_number)
        
        if pre_compiled_image is None:
            print(f'[/process_page] Page {page_number}: No image available')
            gpt_response = 'Page image not available'
            image_size_bytes = 0
        else:
            image_size_bytes = len(pre_compiled_image)
            print(f'[/process_page] Page {page_number}: Image size = {image_size_bytes:,} bytes')
            
            # Call GPT API
            if os.getenv('OPENAI_API_KEY') is None:
                print(f'[/process_page] Page {page_number}: No API key found')
                gpt_response = 'No API key found'
            else:
                try:
                    import json
                    print(f'[/process_page] Page {page_number}: Calling GPT API with function calling')
                    
                    raw_response = get_response_from_chatgpt_multiple_image_and_functions(
                        system_prompt=system_prompt,
                        user_prompt=user_prompt,
                        image_paths=[img_paths[int(page_number)]],
                        model=model,
                        functions=get_markdown_schema(),
                        function_name='provide_markdown_response',
                        pre_compiled_images=None
                    )
                    
                    print(f'[/process_page] Page {page_number}: GPT API call successful, parsing response')
                    
                    try:
                        parsed = json.loads(raw_response)
                        gpt_response = parsed.get('markdown_response', raw_response)
                    except json.JSONDecodeError:
                        print(f'[/process_page] Page {page_number}: Failed to parse JSON, using raw response')
                        gpt_response = raw_response
                    
                    print(f'[/process_page] Page {page_number}: Response extracted successfully')
                except BadRequestError:
                    print(f'[/process_page] Page {page_number}: GPT refused to process')
                    gpt_response = 'GPT refused to process this page'
                except Exception as e:
                    if 'timeout' in str(e).lower() or 'timed out' in str(e).lower():
                        print(f'[/process_page] Page {page_number}: GPT API timeout')
                        gpt_response = 'Timed out contacting GPT for this page'
                    else:
                        print(f'[/process_page] Page {page_number}: GPT API error: {e}')
                        gpt_response = f'Unable to get a response from GPT for this page: {e}'
        
        # Store result in SQL database
        append_page_result(job_id, page_number, gpt_response, image_size_bytes)
        print(f'[/process_page] Page {page_number}: Result stored in database')
        
        # Check if this is the last page
        is_last_page = (page_number == selected_pages[-1])
        
        result = {
            'success': True,
            'job_id': job_id,
            'page': page_number,
            'gpt_response': gpt_response,
            'image_size_bytes': image_size_bytes,
            'is_last_page': is_last_page
        }
        
        # If last page, write CSV and delete table
        if is_last_page:
            print(f'[/process_page] Last page reached, writing CSV file')
            csv_path_to_cleanup = None
            try:
                # Get all results from database
                all_results = get_all_page_results(job_id)
                
                if not all_results:
                    return jsonify({
                        'success': False,
                        'error': 'No results found in database'
                    }), 500
                
                # Create DataFrame
                df = pd.DataFrame(all_results, columns=["page", "gpt_response"])
                
                # Handle output based on output_config
                if output_config.get('outputType') == 'sharepoint':
                    print(f'[/process_page] Saving to SharePoint')
                    context_id = output_config.get('contextId')
                    sharepoint_folder = output_config.get('sharepointFolder')
                    filename = output_config.get('filename', 'output.csv')
                    
                    if not (context_id and sharepoint_folder):
                        print(f'[/process_page] Missing SharePoint context or folder, falling back to browser output')
                        timestamp = datetime.now().strftime('%Y%m%dT%H%M%SZ')
                        csv_filename = secure_filename(f"gpt_responses_{timestamp}.csv")
                        upload_dir = UPLOAD_ROOT / file_id
                        csv_path = upload_dir / csv_filename
                        df.to_csv(str(csv_path), index=False)
                        result['csv_filename'] = csv_filename
                        result['csv_download_url'] = f"/download/{file_id}/{csv_filename}"
                        result['error'] = "Missing SharePoint configuration, saved locally instead"
                    else:
                        def _upload_to_sharepoint():
                            ctx = _new_ctx(context_id)
                            return sharepoint_export_df_to_csv(ctx, sharepoint_folder, filename, df)
                        
                        try:
                            future = EXECUTOR.submit(_upload_to_sharepoint)
                            success = future.result(timeout=60)
                            
                            if success:
                                print(f'[/process_page] Successfully uploaded to SharePoint')
                                result['csv_filename'] = filename
                                result['csv_download_url'] = None
                            else:
                                raise Exception("SharePoint upload returned False")
                        except Exception as sp_error:
                            print(f"SharePoint upload failed: {sp_error}, falling back to browser output")
                            timestamp = datetime.now().strftime('%Y%m%dT%H%M%SZ')
                            csv_filename = secure_filename(f"gpt_responses_{timestamp}.csv")
                            upload_dir = UPLOAD_ROOT / file_id
                            csv_path = upload_dir / csv_filename
                            df.to_csv(str(csv_path), index=False)
                            result['csv_filename'] = csv_filename
                            result['csv_download_url'] = f"/download/{file_id}/{csv_filename}"
                            error_msg = "SharePoint upload timed out" if isinstance(sp_error, FuturesTimeout) else f"SharePoint upload failed: {sp_error}"
                            result['error'] = f"{error_msg}, saved locally instead"
                else:
                    # Save to local filesystem for browser download
                    print(f'[/process_page] Saving to local filesystem')
                    timestamp = datetime.now().strftime('%Y%m%dT%H%M%SZ')
                    csv_filename = secure_filename(f"gpt_responses_{timestamp}.csv")
                    upload_dir = UPLOAD_ROOT / file_id
                    csv_path = upload_dir / csv_filename
                    df.to_csv(str(csv_path), index=False)
                    print(f'[/process_page] CSV saved to {csv_path}')
                    result['csv_filename'] = csv_filename
                    result['csv_download_url'] = f"/download/{file_id}/{csv_filename}"
                
                # Perform cleanup after result is prepared but before returning
                # This ensures cleanup failures don't prevent the user from getting their CSV
                try:
                    print(f'[/process_page] Starting cleanup for job {job_id}')
                    
                    # Delete the SQL table
                    delete_page_results_table(job_id)
                    print(f'[/process_page] Deleted page results table for job {job_id}')
                    
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
