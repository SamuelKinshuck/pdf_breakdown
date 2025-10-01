# Document Processor Application

## Overview

This is a document processing web application that allows users to upload documents (PDF, DOCX, PPTX) and process them using AI models. The system consists of a React TypeScript frontend and a Flask Python backend. Users can upload documents, select specific pages, configure AI processing parameters, and receive processed results.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Environment Configuration
The application supports multiple deployment environments with automatic detection:

**Replit Environment:**
- Backend: Runs on `0.0.0.0:8000` (detected via `REPL_ID` or `REPLIT_DEV_DOMAIN` env vars)
- Frontend: Served by Flask from the backend (same-origin setup)
- Backend URL: Uses `window.location.origin` for API calls
- PYTHONPATH: Set to `/home/runner/workspace` for proper module imports

**Local Development Environment:**
- Backend: Runs on `localhost:4005`
- Frontend: Can run separately on port 3000 or served by Flask
- Backend URL: `http://localhost:4005/`
- Detected by `localhost` in window URL

**stgadfileshare001 Environment:**
- Backend: Runs on `0.0.0.0:8316`
- Backend URL: `http://gad-hosting:8316/`
- Detected by `stgadfileshare001` in the file path

### Frontend Architecture
- **Framework**: React 19 with TypeScript for type safety and modern development
- **Styling**: Tailwind CSS for utility-first styling with custom color scheme
- **Forms**: React Hook Form for efficient form state management and validation
- **HTTP Client**: Axios for API communication with the backend
- **Build Tool**: Create React App for development and build pipeline
- **Configuration**: Dynamic backend URL detection via `config.js` based on environment

The frontend follows a component-based architecture with a main DocumentProcessorForm component handling file uploads and AI processing configuration. The UI uses a custom color scheme with dark grey primary colors and light blue accents.

### Backend Architecture
- **Framework**: Flask as a lightweight web framework for Python
- **CORS**: Flask-CORS enabled for cross-origin requests from the frontend
- **Static Serving**: Serves the React build from `../frontend/build` in production
- **File Processing**: Multi-format document support with conversion capabilities
  - PDF processing using PyPDF2
  - DOCX processing using python-docx
  - PPTX processing using python-pptx
  - Document conversion to PDF using LibreOffice headless mode
- **File Management**: Secure file upload handling with werkzeug utilities
- **Image Processing**: PDF to image conversion using pdf2image and Pillow

The backend uses a simple file-based storage system with an uploads directory for temporary file storage during processing.

### API Structure
- RESTful API design with JSON responses
- File upload endpoints with support for multiple document formats
- Page selection and extraction capabilities
- AI model configuration parameters (temperature, model selection)

### Document Processing Pipeline
1. File upload and validation
2. Format detection and conversion to PDF if needed
3. Page extraction and preview generation
4. Output location selection (download to browser or save to SharePoint)
5. AI processing with configurable parameters
6. Result delivery: browser download or SharePoint upload

### SharePoint Integration (October 2025)
The application now supports direct output to SharePoint in addition to browser downloads:
- **Authentication**: Users can authenticate with SharePoint using interactive browser-based authentication
- **Folder Navigation**: Browse and navigate SharePoint folder structures through a modal interface
- **Output Selection**: Choose between downloading to browser or saving directly to a SharePoint location
- **Filename Specification**: Users can specify custom filenames (must end with .csv) for SharePoint uploads

**SharePoint API Endpoints:**
- `/api/context` - Create SharePoint authentication context
- `/api/folder/list` - List contents of a SharePoint folder
- `/api/folder/tree` - Get recursive folder tree structure
- `/api/search` - Search for files/folders within SharePoint
- `/api/folder/exists` - Check if a folder exists
- `/api/file/exists` - Check if a file exists

**Components:**
- `OutputLocationModal.tsx` - Modal interface for selecting output location and navigating SharePoint folders
- `ProcessingDetailsModal.tsx` - Modal for viewing detailed processing progress (October 2025)
- SharePoint context caching with 5-minute TTL for improved performance

### Processing Progress Display (October 2025)
The application features an improved progress display system for document processing:
- **Concise Progress View**: Shows status, progress bar, percentage, pages done/total, and error messages in a compact display
- **Detailed Progress Modal**: Users can click "View Details" to open a modal showing comprehensive processing information including:
  - Full status information with color-coded states
  - Detailed progress breakdown
  - All processed pages with their GPT responses in an organized, scrollable view
  - Error details if any issues occur
- The modal follows the app's design system with consistent styling and animations

## External Dependencies

### Frontend Dependencies
- **React Ecosystem**: React 19, React DOM, React Scripts for core functionality
- **UI/Styling**: Tailwind CSS, @tailwindcss/forms for enhanced form styling
- **HTTP**: Axios for API requests
- **Forms**: React Hook Form for form management
- **Testing**: Testing Library suite for component testing
- **TypeScript**: For type safety and development tooling

### Backend Dependencies
- **Web Framework**: Flask with CORS support
- **Document Processing**: 
  - PyPDF2 for PDF manipulation
  - python-docx for Word document processing
  - python-pptx for PowerPoint processing
  - pdf2image for PDF to image conversion
- **Image Processing**: Pillow for image manipulation
- **System Integration**: LibreOffice (external dependency) for document conversion
- **SharePoint Integration**: Office365-REST-Python-Client for SharePoint connectivity and file operations

### System Requirements
- **LibreOffice**: Required for converting DOCX/PPTX files to PDF format
- **File System**: Local storage for temporary file uploads and processing
- **AI Integration**: Configured for GPT models (external API integration implied)

### Development Tools
- **Package Management**: npm for frontend, pip for backend
- **Type Checking**: TypeScript compiler
- **Testing**: Jest and Testing Library for frontend testing
- **Build Process**: React Scripts for frontend bundling and development server