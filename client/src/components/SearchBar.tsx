import { useId } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}

export function SearchBar({ value, onChange, placeholder = 'Search reference or contact', label = 'Search' }: SearchBarProps) {
  const id = useId();
  return (
    <div className="search">
      <label className="sr-only" htmlFor={id}>{label}</label>
      <input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
