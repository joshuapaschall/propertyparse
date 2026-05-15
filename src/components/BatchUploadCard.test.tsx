import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BatchUploadCard, { type BatchUploadRejection } from './BatchUploadCard';

const makeFile = (name: string, sizeBytes: number, mime = 'image/png'): File => {
  const blob = new Blob([new Uint8Array(sizeBytes)], { type: mime });
  return new File([blob], name, { type: mime });
};

const fireFileInputChange = (input: HTMLInputElement, files: File[]) => {
  Object.defineProperty(input, 'files', {
    value: files,
    writable: false,
    configurable: true,
  });
  fireEvent.change(input);
};

describe('BatchUploadCard', () => {
  it('accepts multiple PNGs in one selection and appends them to the files array', () => {
    const onChange = vi.fn();
    render(<BatchUploadCard files={[]} onChange={onChange} />);
    const input = screen.getByTestId('batch-upload-input') as HTMLInputElement;

    fireFileInputChange(input, [
      makeFile('a.png', 100, 'image/png'),
      makeFile('b.png', 200, 'image/png'),
    ]);

    expect(onChange).toHaveBeenCalledTimes(1);
    const passed = onChange.mock.calls[0][0] as File[];
    expect(passed).toHaveLength(2);
    expect(passed.map((f) => f.name)).toEqual(['a.png', 'b.png']);
  });

  it('accepts a mix of PNG and JPEG', () => {
    const onChange = vi.fn();
    render(<BatchUploadCard files={[]} onChange={onChange} />);
    const input = screen.getByTestId('batch-upload-input') as HTMLInputElement;

    fireFileInputChange(input, [
      makeFile('a.png', 100, 'image/png'),
      makeFile('b.jpg', 200, 'image/jpeg'),
      makeFile('c.jpeg', 300, 'image/jpeg'),
    ]);

    const passed = onChange.mock.calls[0][0] as File[];
    expect(passed).toHaveLength(3);
  });

  it('rejects truly unsupported types (.txt, .zip)', () => {
    const onChange = vi.fn();
    const onReject = vi.fn();
    render(<BatchUploadCard files={[]} onChange={onChange} onReject={onReject} />);
    const input = screen.getByTestId('batch-upload-input') as HTMLInputElement;

    fireFileInputChange(input, [
      makeFile('archive.zip', 100, 'application/zip'),
      makeFile('notes.txt', 200, 'text/plain'),
    ]);

    expect(onChange).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledTimes(1);
    const rejection = onReject.mock.calls[0][0] as BatchUploadRejection;
    expect(rejection.reason).toBe('type');
    expect(rejection.rejectedFiles).toHaveLength(2);
    expect(screen.getByTestId('batch-upload-inline-error')).toBeInTheDocument();
  });

  it('partially accepts when some files are valid and some are not', () => {
    const onChange = vi.fn();
    const onReject = vi.fn();
    render(<BatchUploadCard files={[]} onChange={onChange} onReject={onReject} />);
    const input = screen.getByTestId('batch-upload-input') as HTMLInputElement;

    fireFileInputChange(input, [
      makeFile('valid.png', 100, 'image/png'),
      makeFile('invalid.zip', 100, 'application/zip'),
    ]);

    expect(onChange).toHaveBeenCalledTimes(1);
    const passed = onChange.mock.calls[0][0] as File[];
    expect(passed.map((f) => f.name)).toEqual(['valid.png']);
    expect(onReject).toHaveBeenCalled();
  });

  it('rejects with reason "count" when total exceeds maxFiles', () => {
    const onChange = vi.fn();
    const onReject = vi.fn();
    const existing = [makeFile('existing.png', 100, 'image/png')];
    render(
      <BatchUploadCard
        files={existing}
        onChange={onChange}
        onReject={onReject}
        maxFiles={2}
      />,
    );
    const input = screen.getByTestId('batch-upload-input') as HTMLInputElement;

    fireFileInputChange(input, [
      makeFile('a.png', 100, 'image/png'),
      makeFile('b.png', 100, 'image/png'),
    ]);

    // PP-MIX behavior accepts as many files as fit the cap and rejects only overflow.
    expect(onChange).toHaveBeenCalledTimes(1);
    const passed = onChange.mock.calls[0][0] as File[];
    expect(passed.map((f) => f.name)).toEqual(['existing.png', 'a.png']);
    expect(onReject).toHaveBeenCalledTimes(1);
    const rejection = onReject.mock.calls[0][0] as BatchUploadRejection;
    expect(rejection.reason).toBe('count');
  });

  it('accepts a mix of images and documents in one selection', () => {
    const onChange = vi.fn();
    render(<BatchUploadCard files={[]} onChange={onChange} />);
    const input = screen.getByTestId('batch-upload-input') as HTMLInputElement;
    fireFileInputChange(input, [
      makeFile('a.png', 100, 'image/png'),
      makeFile('b.png', 100, 'image/png'),
      makeFile('sheet.xlsx', 100, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      makeFile('packet.pdf', 100, 'application/pdf'),
    ]);
    const passed = onChange.mock.calls[0][0] as File[];
    expect(passed.map((f) => f.name)).toEqual(['a.png', 'b.png', 'sheet.xlsx', 'packet.pdf']);
  });

  it('rejects a document larger than maxDocumentSizeBytes with reason size', () => {
    const onChange = vi.fn();
    const onReject = vi.fn();
    render(<BatchUploadCard files={[]} onChange={onChange} onReject={onReject} maxDocumentSizeBytes={1024} />);
    const input = screen.getByTestId('batch-upload-input') as HTMLInputElement;
    fireFileInputChange(input, [
      makeFile('too-big.xlsx', 2048, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      makeFile('big-image.png', 2048, 'image/png'),
    ]);
    const rejection = onReject.mock.calls.find((call) => (call[0] as BatchUploadRejection).reason === 'size')?.[0] as BatchUploadRejection;
    expect(rejection.reason).toBe('size');
    const passed = onChange.mock.calls[0][0] as File[];
    expect(passed.map((f) => f.name)).toEqual(['big-image.png']);
  });

  it('enforces maxImages independently of maxDocuments', () => {
    const onChange = vi.fn();
    const onReject = vi.fn();
    const existing = [makeFile('a.png', 100), makeFile('b.png', 100)];
    render(<BatchUploadCard files={existing} onChange={onChange} onReject={onReject} maxImages={2} maxDocuments={10} />);
    const input = screen.getByTestId('batch-upload-input') as HTMLInputElement;
    fireFileInputChange(input, [
      makeFile('extra.png', 100),
      makeFile('1.xlsx', 100, 'application/vnd.ms-excel'),
      makeFile('2.xlsx', 100, 'application/vnd.ms-excel'),
      makeFile('3.xlsx', 100, 'application/vnd.ms-excel'),
      makeFile('4.xlsx', 100, 'application/vnd.ms-excel'),
      makeFile('5.xlsx', 100, 'application/vnd.ms-excel'),
    ]);
    const passed = onChange.mock.calls[0][0] as File[];
    expect(passed.map((f) => f.name)).toEqual(['a.png', 'b.png', '1.xlsx', '2.xlsx', '3.xlsx', '4.xlsx', '5.xlsx']);
    expect(onReject).toHaveBeenCalled();
  });

  it('enforces maxDocuments independently of maxImages', () => {
    const onChange = vi.fn();
    const onReject = vi.fn();
    const existing = [makeFile('a.xlsx', 100, 'application/vnd.ms-excel'), makeFile('b.xlsx', 100, 'application/vnd.ms-excel')];
    render(<BatchUploadCard files={existing} onChange={onChange} onReject={onReject} maxImages={10} maxDocuments={2} />);
    const input = screen.getByTestId('batch-upload-input') as HTMLInputElement;
    fireFileInputChange(input, [
      makeFile('extra.xlsx', 100, 'application/vnd.ms-excel'),
      makeFile('1.png', 100),
      makeFile('2.png', 100),
      makeFile('3.png', 100),
      makeFile('4.png', 100),
      makeFile('5.png', 100),
    ]);
    const passed = onChange.mock.calls[0][0] as File[];
    expect(passed.map((f) => f.name)).toEqual(['a.xlsx', 'b.xlsx', '1.png', '2.png', '3.png', '4.png', '5.png']);
    expect(onReject).toHaveBeenCalled();
  });

  it('selected files summary shows both image and document counts', () => {
    const files = [
      makeFile('a.png', 100),
      makeFile('b.png', 100),
      makeFile('c.png', 100),
      makeFile('a.xlsx', 100, 'application/vnd.ms-excel'),
      makeFile('b.xlsx', 100, 'application/vnd.ms-excel'),
    ];
    render(<BatchUploadCard files={files} onChange={vi.fn()} />);
    expect(screen.getByText(/5 files selected.*3 images.*2 documents/)).toBeInTheDocument();
  });

  it('APPENDS new files to the existing list rather than replacing', () => {
    const onChange = vi.fn();
    const existing = [makeFile('existing.png', 100, 'image/png')];
    render(<BatchUploadCard files={existing} onChange={onChange} />);
    const input = screen.getByTestId('batch-upload-input') as HTMLInputElement;

    fireFileInputChange(input, [makeFile('new.png', 200, 'image/png')]);

    const passed = onChange.mock.calls[0][0] as File[];
    expect(passed.map((f) => f.name)).toEqual(['existing.png', 'new.png']);
  });

  it('per-file remove button trims that file out of the list', () => {
    const onChange = vi.fn();
    const files = [
      makeFile('a.png', 100, 'image/png'),
      makeFile('b.png', 200, 'image/png'),
      makeFile('c.png', 300, 'image/png'),
    ];
    render(<BatchUploadCard files={files} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('batch-upload-remove-1'));

    const next = onChange.mock.calls[0][0] as File[];
    expect(next.map((f) => f.name)).toEqual(['a.png', 'c.png']);
  });

  it('remove-all button clears the entire list', () => {
    const onChange = vi.fn();
    const files = [
      makeFile('a.png', 100, 'image/png'),
      makeFile('b.png', 200, 'image/png'),
    ];
    render(<BatchUploadCard files={files} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('batch-upload-remove-all'));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('disables interactions when submitting=true', () => {
    const onChange = vi.fn();
    const files = [makeFile('a.png', 100, 'image/png')];
    render(<BatchUploadCard files={files} onChange={onChange} submitting />);

    const input = screen.getByTestId('batch-upload-input') as HTMLInputElement;
    expect(input.disabled).toBe(true);

    const removeAll = screen.getByTestId('batch-upload-remove-all') as HTMLButtonElement;
    expect(removeAll.disabled).toBe(true);

    // Clicking remove-all while submitting should be a no-op.
    fireEvent.click(removeAll);
    expect(onChange).not.toHaveBeenCalled();
  });
});
