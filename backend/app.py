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

app = Flask(__name__)
CORS(app)

# Configuration
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'pptx'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Create upload directory if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

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
                'soffice', '--headless', '--convert-to', 'pdf',
                '--outdir', output_dir, file_path
            ], capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                # Generate PDF filename
                base_name = os.path.splitext(original_filename)[0]
                pdf_filename = f"{base_name}.pdf"
                pdf_path = os.path.join(output_dir, pdf_filename)
                
                if os.path.exists(pdf_path):
                    return pdf_path
                else:
                    print(f"PDF conversion succeeded but file not found: {pdf_path}")
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

@app.route('/', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "message": "Document processing API is running"})

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)
        
        # Convert to PDF if necessary
        pdf_path = convert_to_pdf(file_path, filename)
        
        # Count pages - use original file for more accurate counting
        page_count = count_document_pages(file_path, filename)
        
        return jsonify({
            'success': True,
            'filename': filename,
            'page_count': page_count,
            'file_id': filename  # Using filename as file_id for simplicity
        })
    
    return jsonify({'error': 'Invalid file type. Only PDF, DOCX, and PPTX files are allowed.'}), 400

@app.route('/process', methods=['POST'])
def process_document():
    data = request.get_json()
    
    # Extract form data
    role = data.get('role', '')
    task = data.get('task', '')
    context = data.get('context', '')
    format_field = data.get('format', '')
    constraints = data.get('constraints', '')
    temperature = data.get('temperature', 0.5)
    model = data.get('model', 'GPT-4.1')
    file_id = data.get('file_id', '')
    selected_pages = data.get('selected_pages', [])
    
    # Here you would process the document with the selected pages
    # For now, return a success response
    return jsonify({
        'success': True,
        'message': 'Document processed successfully',
        'processed_data': {
            'role': role,
            'task': task,
            'context': context,
            'format': format_field,
            'constraints': constraints,
            'temperature': temperature,
            'model': model,
            'file_id': file_id,
            'selected_pages': selected_pages
        }
    })

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8000)