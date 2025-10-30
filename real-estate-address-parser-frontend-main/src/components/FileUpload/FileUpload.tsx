import React from 'react';
import { Upload, Button } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { UploadChangeParam } from 'antd/es/upload';
import type { RcFile, UploadFile } from 'antd/es/upload/interface';

interface FileUploadProps {
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  accept?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({ 
  onFileChange, 
  accept = ".csv,.xlsx,.xls,.pdf" 
}) => {
  const handleChange = (info: UploadChangeParam<UploadFile<any>>) => {
    console.log('handleChange');
    console.log(info);
    if (info.fileList[0].originFileObj) {
      // Create a synthetic event to match the expected type
      const syntheticEvent = {
        target: {
          files: [info.fileList[0].originFileObj]
        }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      
      onFileChange(syntheticEvent);
    }
  };

  const beforeUpload = (file: RcFile) => {
    // Prevent actual upload, we just want to handle the file
    return false;
  };

  return (
    <Upload
      accept={accept}
      onChange={handleChange}
      beforeUpload={beforeUpload}
      maxCount={1}
      className="w-full"
    >
      <Button icon={<UploadOutlined />} className="w-full h-10">
        Click to Upload
      </Button>
    </Upload>
  );
};

export default FileUpload; 