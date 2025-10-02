# Document Processor Application

## Overview

This is a document processing web application that allows users to upload documents (PDF, DOCX, PPTX) and process them using AI models. The system consists of a React TypeScript frontend and a Flask Python backend. Users can upload documents, select specific pages, configure AI processing parameters, and receive processed results.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Environment Configuration
The application supports multiple deployment environments with automatic detection and a centralized configuration system:

**API Configuration Module (`frontend/src/apiConfig.ts`):**
- Single source of truth for backend URL detection across all components
- Eliminates reliance on window.BACKEND_URL which can be undefined during certain startup flows
- Provides consistent environment detection with multiple fallback layers:
  1. REACT_APP_API_BASE environment variable (highest priority)
  2. window.BACKEND_URL from public/config.js
  3. Automatic detection based on window.location
  4. Same-origin fallback for production builds served by Flask

**Development Mode (npm run start):**
- Backend: Runs on `0.0.0.0:8000` for both local and Replit environments
- Frontend: Runs on port 5000 via CRA dev server with hot reloading
- Proxy: package.json configured with `"proxy": "http://localhost:8000"` to forward API requests during development
- Backend URL: Automatically detected as `http://localhost:8000/` (local) or `:8000` port on Replit domain
- PYTHONPATH: Set to `/home/runner/workspace` for proper module imports in Replit

**Production Mode (npm run build + Flask):**
- Backend: Serves React build from `../frontend/build` on port 8000
- Frontend: Static files served by Flask at same-origin
- Backend URL: Uses relative paths (same-origin)
- Deployment: Backend and frontend on same domain/port for simplified CORS

**stgadfileshare001 Environment:**
- Backend: Runs on `0.0.0.0:8316`
- Backend URL: `http://gad-hosting:8316/`
- Detected by `stgadfileshare001` in the file path

### Frontend Architecture
- **Framework**: React 19 with TypeScript for type safety and modern development
- **Styling**: Tailwind CSS for utility-first styling with custom color scheme
- **Forms**: React Hook Form for efficient form state management and validation
- **HTTP Client**: Axios for API requests (with native fetch for new prompt features)
- **Build Tool**: Create React App for development and build pipeline
- **Configuration**: 
  - Centralized API configuration via `src/apiConfig.ts` module
  - CRA development proxy pointing to `http://localhost:8000`
  - Fallback config.js in public folder for backwards compatibility
  - Environment variable support via REACT_APP_API_BASE

The frontend follows a component-based architecture with a main DocumentProcessorForm component handling file uploads and AI processing configuration. All components import `BACKEND_URL` from the centralized apiConfig module rather than relying on window globals, ensuring consistent API communication across all deployment scenarios. The UI uses a custom color scheme with dark grey primary colors and light blue accents.

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

### Prompt Management System (October 2025)
The application includes a comprehensive prompt save and search system allowing users to store and reuse prompt configurations:

**Features:**
- **Save Prompts**: Users can save all five prompt sections (Role, Task, Context, Format, Constraints) with a single click
  - Unique naming requirement prevents duplicates
  - Optional metadata: description, tags, creator name
  - Confirmation feedback on successful save
- **Search Prompts**: Advanced search interface with multiple filters
  - Search by text in prompt name, body, or both
  - Filter by tags and creator
  - Results displayed in concise cards showing key information
  - Usage statistics tracked (use count, last used date)
- **Detailed View Modal**: Click to see full prompt details before applying
- **One-Click Load**: Select any saved prompt to instantly populate all form fields

**Database Implementation:**
- SQLite database stored in `./data/prompts.db`
- WAL (Write-Ahead Logging) mode for better concurrency
- Retry logic for database locking scenarios
- Context managers for safe connection handling
- Automatic table creation and schema management

**API Endpoints:**
- `POST /api/prompts/save` - Save new prompt configuration
- `GET /api/prompts/search` - Search prompts with filters
- `GET /api/prompts/<id>` - Retrieve specific prompt (increments use count)
- `DELETE /api/prompts/<id>` - Delete a saved prompt

**Components:**
- `SavePromptModal.tsx` - Modal for saving prompts with metadata
- `SearchPromptsModal.tsx` - Search interface with filters and results display
- Database module: `backend/database.py` - Robust SQLite operations layer

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
- **Database**: SQLite3 for prompt storage and management
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