import React from 'react';
import { Select } from 'antd';

interface Option {
  label: string;
  value: string;
}

interface LocationSelectProps {
  options: Option[];
  value: Option | null;
  onChange: (option: Option | null) => void;
  placeholder?: string;
  isDisabled?: boolean;
  className?: string;
}

const LocationSelect: React.FC<LocationSelectProps> = ({ 
  options, 
  value, 
  onChange, 
  placeholder, 
  isDisabled,
  className 
}) => {
  return (
    <Select
      className={className}
      options={options}
      value={value?.value}
      onChange={(val, option) => {
        if (val) {
          onChange(option as Option);
        } else {
          onChange(null);
        }
      }}
      placeholder={placeholder}
      disabled={isDisabled}
      allowClear
      style={{ width: '100%' }}
    />
  );
};

export default LocationSelect; 