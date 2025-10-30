import { useMemo } from 'react';
import citiesJson from '../assets/data.json';
import countiesJson from '../assets/counties_list.json';
import statesJson from '../assets/states_json.json';

interface LocationOption {
  value: string;
  label: string;
}

export const useLocationData = (state: LocationOption | null, county: LocationOption | null, city: LocationOption | null) => {
  const stateOptions = useMemo(() => 
    Object.values(statesJson).map((stateName) => ({
      value: stateName,
      label: stateName,
    })), []);

  const countyOptions = useMemo(() => 
    !county && state
      ? countiesJson
          .filter((item) => item.State.toLowerCase() === state.value.toLowerCase())
          .map((item) => ({ value: item.County, label: item.County }))
      : [], [state, county]);

  const cityOptions = useMemo(() => 
    !city && state
      ? Object.entries(citiesJson)
          .filter(([stateName]) => stateName.toLowerCase() === state.value.toLowerCase())
          .flatMap(([, cities]) => cities.map((cityName) => ({ 
            value: cityName, 
            label: cityName 
          })))
      : [], [state, city]);

  return { stateOptions, countyOptions, cityOptions };
}; 