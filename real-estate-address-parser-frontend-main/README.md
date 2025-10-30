# Address Parser

A powerful web application that leverages GPT-4 Vision and Google Maps API to extract, verify, and standardize addresses from various file formats. This tool helps real estate professionals and businesses efficiently process address data from documents.

## 🚀 Features

- **Multi-Format Support**: 
  - PDF documents
  - Images (PNG, JPG, JPEG)
  - Excel files (XLS, XLSX)
  - CSV files
- **Smart Address Extraction**:
  - GPT-4 Vision powered OCR
  - Intelligent address recognition
  - Batch processing capability
- **Address Verification**:
  - Google Maps API integration
  - Address standardization
  - Geographic validation
- **Location Filtering**:
  - State-level filtering
  - County-level filtering
  - City-level filtering
- **Real-time Processing**:
  - Progress tracking
  - Instant feedback
  - Error handling

## 🛠️ Tech Stack

### Frontend
- **Framework**: React with TypeScript
- **UI Components**: Ant Design
- **Styling**: Tailwind CSS
- **File Handling**: 
  - PapaParse for CSV
  - Ant Design Upload
- **HTTP Client**: Axios

### Backend
- **Framework**: FastAPI
- **AI Integration**: OpenAI GPT-4 Vision
- **Geocoding**: Google Maps API
- **File Processing**:
  - pdf2image
  - Pandas
  - Pillow

## 🚀 Getting Started

1. Clone the repository
2. Install dependencies:

```bash
# Frontend
cd frontend
npm install

# Backend
cd backend
pip install -r requirements.txt
```

3. Set up environment variables:

```env
# Backend .env
OPENAI_API_KEY=your_openai_key
GOOGLE_MAPS_API_KEY=your_google_maps_key
ENVIRONMENT=development

# Frontend .env
VITE_API_URL=http://localhost:8000
```

4. Start the development servers:

```bash
# Frontend
npm run dev

# Backend
uvicorn api:app --reload
```

## 📁 Project Structure

```
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── FileUpload/
│   │   │   ├── LocationSelect/
│   │   │   └── DataTable/
│   │   ├── services/
│   │   └── App.tsx
│   └── package.json
│
└── backend/
    ├── api.py
    └── requirements.txt
```

## 🔑 API Keys Required

- **OpenAI API Key**: For GPT-4 Vision OCR
- **Google Maps API Key**: For address verification
  - Required APIs:
    - Places API
    - Geocoding API
    - Maps JavaScript API

## 📄 License

This project is private and proprietary. All rights reserved.

## 🤝 Support

For support, please contact [Your Contact Information].