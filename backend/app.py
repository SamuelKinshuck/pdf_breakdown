from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from werkzeug.utils import secure_filename
import PyPDF2
from docx import Document
from pptx import Presentation
from pdf2image import convert_from_path
import tempfile
import shutil
import subprocess
import io
import base64
from PIL import Image
import fitz
from openai import BadRequestError

from flask import Flask, request, jsonify, send_from_directory
import pandas as pd
from io import BytesIO
import base64
from datetime import datetime
from PyPDF2 import PdfReader
from gpt_interface import get_response_from_chatgpt_image

import uuid
from pathlib import Path
from typing import List, Dict

try:
    BASE_DIR = Path(__file__).resolve().parent
except NameError:
    BASE_DIR = Path.cwd()
UPLOAD_ROOT = BASE_DIR / 'uploads'


def _images_from_df_path(pdf_path: str,
                         selected_pages: List[int]) -> Dict[int, str]:
    doc = fitz.open(pdf_path)
    page_images_for_gpt = {}
    for page_num, page in enumerate(list(doc)):
        if (page_num + 1) not in selected_pages:
            continue
        pix = page.get_pixmap(dpi=150)
        img_bytes = pix.tobytes("png")
        base64_encoded = base64.b64encode(img_bytes).decode('utf-8')
        data_url = f"data:image/png;base64,{base64_encoded}"
        page_images_for_gpt[page_num + 1] = data_url
    return page_images_for_gpt


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


app = Flask(__name__, static_folder='../frontend/build', static_url_path='')
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


@app.route('/process', methods=['POST'])
def process_document():
    data = request.get_json()
    print('*' * 80)
    print('data in /process')
    print(data)

    # Extract form data...
    role = data.get('role', '')
    task = data.get('task', '')
    context = data.get('context', '')
    format_field = data.get('format', '')
    constraints = data.get('constraints', '')
    model = (data.get('model') or 'gpt-4.1').lower()
    file_id = data.get('file_id', '')
    selected_pages = data.get('selected_pages', [])

    if not file_id:
        return jsonify({'success': False, 'error': 'file_id is required'}), 400
    if not isinstance(selected_pages, list) or not selected_pages:
        return jsonify({
            'success': False,
            'error': 'selected_pages must be a non-empty list'
        }), 400

    # Resolve canonical PDF for this upload
    try:
        pdf_path = _pdf_path_for_file_id(
            file_id)  # uploads/<file_id>/document.pdf
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Could not resolve PDF: {e}'
        }), 400

    images_for_gpt = _images_from_df_path(pdf_path, selected_pages)
    system_prompt = 'you are a helpful assistant'
    user_prompt = _compose_user_prompt(role, task, context, format_field,
                                       constraints)
    rows = []
    for key, value in images_for_gpt.items():
        print(f'Asking GPT to process page {key}')
        print(key)
        if os.getenv('OPENAI_API_KEY') is None:
            rows.append({'gpt_response': 'No API key found', 'page': key})
            continue
        try:
            response = get_response_from_chatgpt_image(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                image_path=None,
                model=model,
                pre_compiled_image=value)
        except BadRequestError:
            response = 'GPT refused to process this page'
        except:
            response = 'Unable to get a response from GPT for this page'
        rows.append({'gpt_response': response, 'page': key})

    if not rows:
        return jsonify({
            'success': False,
            'message': 'could not find selected pages'
        })

    # Save CSV into the same upload folder
    df = pd.DataFrame(rows, columns=['page', 'gpt_response'])
    timestamp = datetime.now().strftime('%Y%m%dT%H%M%SZ')
    csv_filename = secure_filename(f"gpt_responses_{timestamp}.csv")
    upload_dir = UPLOAD_ROOT / file_id
    csv_path = upload_dir / csv_filename
    df.to_csv(str(csv_path), index=False)

    return jsonify({
        'success': True,
        'message': 'Document processed successfully',
        'result_count': len(rows),
        'csv_filename': csv_filename,
        'csv_download_url': f"/download/{file_id}/{csv_filename}"
    })


@app.route("/api/ping")
def ping():
    return jsonify({"status": "ok"})


@app.route("/")
def root():
    return app.send_static_file("index.html")


try:
    if BASE_DIR.find('stgadfileshare001') == -1:
        print('local')
        HOST = 'localhost'
        PORT = 4004
    else:
        HOST = '0.0.0.0'
        PORT = 8316
except:
    HOST = 'localhost'
    PORT = 4004


if __name__ == '__main__':
    app.run(debug=False, host=HOST, port=PORT)
