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
VITE_ALLOW_SELF_SIGNUP=false
VITE_SITE_URL=http://localhost:5173
```

4. Start the development servers:

```bash
# Frontend
npm run dev

# Backend
uvicorn api:app --reload
```


### Auth redirect configuration

Set `VITE_SITE_URL` to your canonical frontend origin so Supabase magic/invite links always resolve to the correct host (no www/non-www token loss).

- Development: `VITE_SITE_URL=http://localhost:5173`
- Production: `VITE_SITE_URL=https://propertyparse.com`

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

## Recent changes

### Phase B2a — batch upload mode + orchestration

- New `BatchUploadCard` (multi-image picker with append-on-add, per-file remove, size limit, dark-mode styled to mirror `FileUploadCard`).
- ParsePage gains a Single/Batch tab toggle and a parallel `handleBatchParse` orchestration: createBatch → compress images → chunk into ≤20 MB PDFs → upload + parseFileAsync each chunk with `batchId`. Sequential by design to bound peak browser memory at 1500-image scale.
- New `createBatch()` in `src/lib/api.ts`; `ParseLocationPayload` gains optional `batchId` + `metadata` fields that pass through to the backend.
- Single-file flow byte-identical to pre-B2a behavior. Tests: 13 new cases. Phase B2b will add the aggregated batch progress view (polls `/batches/{id}`).

### Phase B1 — image batch utilities (foundation only)

- New utilities in `src/lib/`: `imageCompressor.ts` (canvas → JPEG with maxDimension + quality), `pdfStitcher.ts` (pdf-lib-based N-image → PDF + page manifest), `pdfChunker.ts` (greedy probe-and-roll-back packer that splits N images into M PDFs ≤ 20 MB each).
- Added `pdf-lib@^1.17.1` dependency.
- 19 new test cases across 3 co-located test files; no existing files modified.
- No UI changes — Phase B2 wires these into the batch upload flow.