# Document Processor Application

## Overview

This is a document processing web application that allows users to upload documents (PDF, DOCX, PPTX) and process them using AI models. The system consists of a React TypeScript frontend and a Flask Python backend. Users can upload documents, select specific pages, configure AI processing parameters, and receive processed results.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 19 with TypeScript for type safety and modern development
- **Styling**: Tailwind CSS for utility-first styling with custom color scheme
- **Forms**: React Hook Form for efficient form state management and validation
- **HTTP Client**: Axios for API communication with the backend
- **Build Tool**: Create React App for development and build pipeline

The frontend follows a component-based architecture with a main DocumentProcessorForm component handling file uploads and AI processing configuration. The UI uses a custom color scheme with dark grey primary colors and light blue accents.

### Backend Architecture
- **Framework**: Flask as a lightweight web framework for Python
- **CORS**: Flask-CORS enabled for cross-origin requests from the frontend
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
4. AI processing with configurable parameters
5. Result delivery back to frontend

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

### System Requirements
- **LibreOffice**: Required for converting DOCX/PPTX files to PDF format
- **File System**: Local storage for temporary file uploads and processing
- **AI Integration**: Configured for GPT models (external API integration implied)

### Development Tools
- **Package Management**: npm for frontend, pip for backend
- **Type Checking**: TypeScript compiler
- **Testing**: Jest and Testing Library for frontend testing
- **Build Process**: React Scripts for frontend bundling and development server