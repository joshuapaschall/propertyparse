import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import FileUpload from './components/FileUpload/FileUpload';
import LocationSelect from './components/LocationSelect/LocationSelect';
import DataTable from './components/DataTable/DataTable';
import "./App.css";
import { useLocationData } from './hooks/useLocationData';
import { checkApiKeys, checkServerHealth, uploadFile } from './services/api';
import LoadingSpinner from './LoadingSpinner';
import 'antd/dist/reset.css';
import { Button, Typography } from 'antd';
const { Title } = Typography;

interface LocationOption {
  label: string;
  value: string;
}

interface CsvRow {
  State: string;
  City: string;
  County: string;
  [key: string]: string; // For any additional columns
}

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<LocationOption | null>(null);
  const [county, setCounty] = useState<LocationOption | null>(null);
  const [city, setCity] = useState<LocationOption | null>(null);
  const [csvData, setCsvData] = useState<string | null>(null);
  const [correctCsvData, setCorrectCsvData] = useState<string | null>(null);
  const [errorCsvData, setErrorCsvData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');

  const { stateOptions, countyOptions, cityOptions } = useLocationData(state, county, city);

  useEffect(() => {
    const checkServer = async () => {
      try {
        await checkServerHealth();
        setServerStatus('connected');
        setError(null);
      } catch (err) {
        setServerStatus('disconnected');
        setError('Cannot connect to server. Please check if backend is running.');
      }
    };

    checkServer();
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('handleFileChange');
    const files = event.target.files;
    if (files) {
      setFile(files[0]);
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    const apiKeysValid = await checkApiKeys();
    if (!apiKeysValid) {
      setError('API keys are invalid or expired. Please contact support.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setCsvData(null);
    setCorrectCsvData(null);
    setErrorCsvData(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('user_id', '1234');
    if (state?.value) formData.append('state', state.value);
    if (county?.value) formData.append('county', county.value);
    if (city?.value) formData.append('city', city.value);

    try {
      const responseData = await uploadFile(formData);
      if (typeof responseData === 'string') {
        const parsedData = Papa.parse<CsvRow>(responseData, { header: true });
        filterCsvData(parsedData.data);
        setCsvData(responseData);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error: any) {
      if (error.response?.data?.detail) {
        if (error.response.data.detail.includes('REQUEST_DENIED')) {
          setError('The Google Maps service is temporarily unavailable. Please try again later or contact support.');
        } else {
          setError(error.response.data.detail);
        }
      } else if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('An unknown error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const filterCsvData = (data: CsvRow[]) => {
    const correctData: CsvRow[] = [];
    const errorData: CsvRow[] = [];

    data.forEach((row) => {
      if (row.State && row.City && row.County) {
        const rowState = row.State.toLowerCase();
        const rowCity = row.City.toLowerCase();
        const rowCounty = row.County.toLowerCase();
        const selectedState = state?.value?.toLowerCase() || '';
        const selectedCity = city?.value?.toLowerCase() || '';
        const selectedCounty = county?.value?.toLowerCase() || '';

        if (
          (selectedState && rowState !== selectedState) ||
          (selectedCity && rowCity !== selectedCity) ||
          (selectedCounty && rowCounty !== selectedCounty)
        ) {
          errorData.push(row);
        } else {
          correctData.push(row);
        }
      }
    });

    setCorrectCsvData(Papa.unparse(correctData));
    setErrorCsvData(Papa.unparse(errorData));
  };

  const downloadCsv = (data: string, filename: string) => {
    const blob = new Blob([data], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full h-full bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center">
      <Title level={1} className="text-center mb-8">
        Real Estate GPT-Powered Address Parser
      </Title>

      <div className={`fixed bottom-0 left-0 right-0 p-4 mb-4 rounded-lg
        ${serverStatus === 'connected' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}
      `}>
        Server Status: {serverStatus}
      </div>

      <div className="max-w-xl w-full mx-auto bg-white rounded-xl shadow-md p-6 space-y-6">
        <div className="space-y-4">
          <div className="w-full">
            <FileUpload onFileChange={handleFileChange} />
          </div>

          <div className="flex flex-col max-w-xl gap-4">
            <LocationSelect
              className="w-full"
              options={stateOptions}
              value={state}
              onChange={setState}
              placeholder="Select State"
            />

            <LocationSelect
              className="w-full"
              options={countyOptions}
              value={county}
              onChange={setCounty}
              placeholder="Select County"
              isDisabled={!state}
            />

            <LocationSelect
              className="w-full"
              options={cityOptions}
              value={city}
              onChange={setCity}
              placeholder="Select City"
              isDisabled={!state}
            />
          </div>

          <Button
            onClick={handleSubmit}
            type="primary"
            loading={isLoading}
            disabled={!file}
            className={`
              !w-full !py-3 !px-4 !rounded-lg !font-medium !text-sm
              !transition-colors !duration-200
              ${!file
                ? '!bg-gray-200 !text-gray-500 !cursor-not-allowed'
                : '!bg-indigo-600 !text-white hover:!bg-indigo-700 focus:!ring-2 focus:!ring-offset-2 focus:!ring-indigo-500'
              }
            `}
          >
            Submit
          </Button>
        </div>
      </div>
      {errorCsvData && (
        <div className="max-w-3xl mx-auto mt-8">
          <DataTable
            data={errorCsvData}
            title="Error CSV Data"
            onDownload={downloadCsv}
            filename="error.csv"
          />
        </div>
      )}

      {correctCsvData && (
        <div className="max-w-3xl mx-auto mt-8">
          <DataTable
            data={correctCsvData}
            title="Correct CSV Data"
            onDownload={downloadCsv}
            filename="correct.csv"
          />
        </div>
      )}

      {error && (
        <div className="max-w-3xl mx-auto mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

export default App; 