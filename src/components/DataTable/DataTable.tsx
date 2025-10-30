import React from 'react';
import Papa, { ParseResult } from 'papaparse';

interface DataTableProps {
  data: string;
  title: string;
  onDownload: (data: string, filename: string) => void;
  filename: string;
}

interface ParsedRow {
  [key: string]: string;
}

const DataTable: React.FC<DataTableProps> = ({ data, title, onDownload, filename }) => {
  const parsedData: ParseResult<ParsedRow> = Papa.parse(data, { header: true });
  
  return (
    <div className="csv-container">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            {parsedData.meta.fields?.map((header, index) => (
              <th key={index}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {parsedData.data.map((row: ParsedRow, rowIndex: number) => (
            <tr key={rowIndex}>
              {Object.values(row).map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => onDownload(data, filename)}>
        Download {title}
      </button>
    </div>
  );
};

export default DataTable; 