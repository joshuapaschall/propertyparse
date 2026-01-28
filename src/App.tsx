import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import FileUpload from './components/FileUpload/FileUpload';
import LocationSelect from './components/LocationSelect/LocationSelect';
import './App.css';
import { searchStates, searchCounties, searchCities, uploadFile, parseFile } from './lib/api';
import 'antd/dist/reset.css';
import { Button, Typography } from 'antd';

const { Title } = Typography;

interface LocationOption {
  label: string;
  value: string;
}

function App() {
  const [stateVal, setStateVal] = useState('');
  const [county, setCounty] = useState('');
  const [city, setCity] = useState('');
  const [states, setStates] = useState<string[]>([]);
  const [counties, setCounties] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    searchStates('').then((r) => setStates(r.items)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!stateVal) {
      setCounties([]);
      setCounty('');
      setCities([]);
      setCity('');
      return;
    }
    searchCounties(stateVal, '').then((r) => setCounties(r.items)).catch(() => {});
  }, [stateVal]);

  useEffect(() => {
    if (!stateVal || !county) {
      setCities([]);
      setCity('');
      return;
    }
    searchCities(stateVal, county, '').then((r) => setCities(r.items)).catch(() => {});
  }, [stateVal, county]);

  const stateOptions: LocationOption[] = states.map((item) => ({
    label: item,
    value: item,
  }));

  const countyOptions: LocationOption[] = counties.map((item) => ({
    label: item,
    value: item,
  }));

  const cityOptions: LocationOption[] = cities.map((item) => ({
    label: item,
    value: item,
  }));

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    setFile(files?.[0] ?? null);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    setRows([]);
    setTotal(0);
    setBusy(true);
    try {
      if (!file) {
        throw new Error('Please select a file first.');
      }
      const up = await uploadFile(file);
      const parsed = await parseFile(up.fileId, { state: stateVal, county, city });
      setRows(parsed.items);
      setTotal(parsed.total);
      setMsg(`Parsed ${parsed.total} rows (showing ${parsed.items.length}).`);
    } catch (ex: any) {
      setErr(ex?.message || 'Upload/parse failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full h-full bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center">
      <Title level={1} className="text-center mb-8">
        Real Estate GPT-Powered Address Parser
      </Title>

      <div className="max-w-xl w-full mx-auto bg-white rounded-xl shadow-md p-6 space-y-6">
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="w-full">
            <FileUpload onFileChange={handleFileChange} />
          </div>

          <div className="flex flex-col max-w-xl gap-4">
            <LocationSelect
              className="w-full"
              options={stateOptions}
              value={stateVal ? { label: stateVal, value: stateVal } : null}
              onChange={(option) => setStateVal(option?.value ?? '')}
              placeholder="Select State"
            />

            <LocationSelect
              className="w-full"
              options={countyOptions}
              value={county ? { label: county, value: county } : null}
              onChange={(option) => setCounty(option?.value ?? '')}
              placeholder="Select County"
              isDisabled={!stateVal}
            />

            <LocationSelect
              className="w-full"
              options={cityOptions}
              value={city ? { label: city, value: city } : null}
              onChange={(option) => setCity(option?.value ?? '')}
              placeholder="Select City"
              isDisabled={!stateVal || !county}
            />
          </div>

          <Button
            htmlType="submit"
            type="primary"
            loading={busy}
            disabled={!file || busy}
            className={
              `
              !w-full !py-3 !px-4 !rounded-lg !font-medium !text-sm
              !transition-colors !duration-200
              ${!file
                ? '!bg-gray-200 !text-gray-500 !cursor-not-allowed'
                : '!bg-indigo-600 !text-white hover:!bg-indigo-700 focus:!ring-2 focus:!ring-offset-2 focus:!ring-indigo-500'
              }
            `
            }
          >
            Submit
          </Button>
        </form>
      </div>

      {msg && (
        <div className="max-w-3xl mx-auto mt-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          {msg}
        </div>
      )}

      {err && (
        <div className="max-w-3xl mx-auto mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {err}
        </div>
      )}

      {!!rows.length && (
        <div className="max-w-5xl w-full mx-auto mt-6 bg-white rounded-xl shadow-md p-6 space-y-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4">Address</th>
                <th className="py-2 pr-4">City</th>
                <th className="py-2 pr-4">State</th>
                <th className="py-2">ZIP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b last:border-b-0">
                  <td className="py-2 pr-4">{row.address_raw}</td>
                  <td className="py-2 pr-4">{row.city_raw}</td>
                  <td className="py-2 pr-4">{row.state_raw}</td>
                  <td className="py-2">{row.zip_raw}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end">
            <Button
              onClick={() => {
                const blob = new Blob([JSON.stringify({ total, items: rows }, null, 2)], {
                  type: 'application/json',
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'parsed.json';
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download JSON
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
