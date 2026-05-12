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

  it('rejects PDF / CSV / other unsupported types with reason "type"', () => {
    const onChange = vi.fn();
    const onReject = vi.fn();
    render(<BatchUploadCard files={[]} onChange={onChange} onReject={onReject} />);
    const input = screen.getByTestId('batch-upload-input') as HTMLInputElement;

    fireFileInputChange(input, [
      makeFile('doc.pdf', 100, 'application/pdf'),
      makeFile('addresses.csv', 200, 'text/csv'),
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
      makeFile('invalid.pdf', 100, 'application/pdf'),
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

    expect(onChange).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledTimes(1);
    const rejection = onReject.mock.calls[0][0] as BatchUploadRejection;
    expect(rejection.reason).toBe('count');
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
