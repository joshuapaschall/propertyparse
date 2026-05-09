import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FileUploadCard, { type FileUploadRejection } from './FileUploadCard';

const makeFile = (name: string, sizeBytes: number, mime = 'text/csv'): File => {
  // Build a Blob of the requested size, then wrap as File with the given name.
  const blob = new Blob([new Uint8Array(sizeBytes)], { type: mime });
  return new File([blob], name, { type: mime });
};

const fireFileChange = (input: HTMLInputElement, files: File[]) => {
  Object.defineProperty(input, 'files', {
    value: files,
    configurable: true,
  });
  fireEvent.change(input);
};

describe('FileUploadCard', () => {
  it('accepts a small CSV via click-browse and forwards via onChange', () => {
    const onChange = vi.fn();
    render(<FileUploadCard file={null} onChange={onChange} />);
    const input = screen.getByTestId('file-upload-input') as HTMLInputElement;
    const validFile = makeFile('addresses.csv', 1024);
    fireFileChange(input, [validFile]);
    expect(onChange).toHaveBeenCalledWith(validFile);
  });

  it('rejects oversized files (B54)', () => {
    const onChange = vi.fn();
    const onReject = vi.fn<(r: FileUploadRejection) => void>();
    render(
      <FileUploadCard
        file={null}
        onChange={onChange}
        onReject={onReject}
        maxSizeBytes={1024}
      />,
    );
    const input = screen.getByTestId('file-upload-input') as HTMLInputElement;
    const oversized = makeFile('big.csv', 2048);
    fireFileChange(input, [oversized]);

    expect(onChange).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledTimes(1);
    const rejection = onReject.mock.calls[0][0];
    expect(rejection.reason).toBe('size');
    expect(rejection.file).toBe(oversized);
    expect(screen.getByTestId('file-upload-inline-error')).toHaveTextContent(/exceeds/i);
  });

  it('rejects unsupported file types (B54)', () => {
    const onChange = vi.fn();
    const onReject = vi.fn<(r: FileUploadRejection) => void>();
    render(<FileUploadCard file={null} onChange={onChange} onReject={onReject} />);
    const input = screen.getByTestId('file-upload-input') as HTMLInputElement;
    const bad = makeFile('virus.exe', 100, 'application/octet-stream');
    fireFileChange(input, [bad]);

    expect(onChange).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onReject.mock.calls[0][0].reason).toBe('type');
    expect(screen.getByTestId('file-upload-inline-error')).toHaveTextContent(/unsupported/i);
  });

  it('accepts a file via drag-and-drop (B56)', () => {
    const onChange = vi.fn();
    render(<FileUploadCard file={null} onChange={onChange} />);
    const dropzone = screen.getByTestId('file-upload-dropzone');
    const validFile = makeFile('addresses.csv', 1024);

    // Simulate drop with dataTransfer.files populated.
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [validFile] },
    });

    expect(onChange).toHaveBeenCalledWith(validFile);
  });

  it('rejects oversized drag-and-drop files via the same validation path (B54 + B56)', () => {
    const onChange = vi.fn();
    const onReject = vi.fn<(r: FileUploadRejection) => void>();
    render(
      <FileUploadCard
        file={null}
        onChange={onChange}
        onReject={onReject}
        maxSizeBytes={1024}
      />,
    );
    const dropzone = screen.getByTestId('file-upload-dropzone');
    const oversized = makeFile('big.csv', 2048);

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [oversized] },
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onReject.mock.calls[0][0].reason).toBe('size');
  });

  it('shows visual feedback during dragOver (B56)', () => {
    render(<FileUploadCard file={null} onChange={() => {}} />);
    const dropzone = screen.getByTestId('file-upload-dropzone');

    // Pre-drag: not in the indigo-accent state.
    expect(dropzone.className).not.toMatch(/border-indigo-400/);

    fireEvent.dragOver(dropzone, { dataTransfer: { files: [] } });
    expect(dropzone.className).toMatch(/border-indigo-400/);

    fireEvent.dragLeave(dropzone, { dataTransfer: { files: [] } });
    expect(dropzone.className).not.toMatch(/border-indigo-400/);
  });

  it('clears inline error when a valid file is supplied after a rejection (B54)', () => {
    const onChange = vi.fn();
    const { rerender } = render(<FileUploadCard file={null} onChange={onChange} maxSizeBytes={1024} />);
    const input = screen.getByTestId('file-upload-input') as HTMLInputElement;

    fireFileChange(input, [makeFile('big.csv', 2048)]);
    expect(screen.getByTestId('file-upload-inline-error')).toBeInTheDocument();

    // Re-render with a fresh small file selection.
    fireFileChange(input, [makeFile('small.csv', 512)]);
    rerender(<FileUploadCard file={null} onChange={onChange} maxSizeBytes={1024} />);
    expect(screen.queryByTestId('file-upload-inline-error')).not.toBeInTheDocument();
  });
});
