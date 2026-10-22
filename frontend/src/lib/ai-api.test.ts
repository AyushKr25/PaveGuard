import { validateImageFile, validateVideoFile, base64ToBlob } from './ai-api';

function makeFile(type: string, size: number): File {
  return new File([new ArrayBuffer(size)], 'test-file', { type });
}

describe('AI API helpers', () => {
  describe('validateImageFile', () => {
    it('accepts supported image types', () => {
      expect(validateImageFile(makeFile('image/jpeg', 1000)).valid).toBe(true);
      expect(validateImageFile(makeFile('image/png', 1000)).valid).toBe(true);
      expect(validateImageFile(makeFile('image/webp', 1000)).valid).toBe(true);
    });

    it('rejects unsupported types', () => {
      const result = validateImageFile(makeFile('application/pdf', 1000));
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/unsupported file type/i);
    });

    it('rejects oversized files', () => {
      const result = validateImageFile(makeFile('image/jpeg', 11 * 1024 * 1024));
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/too large/i);
    });
  });

  describe('validateVideoFile', () => {
    it('accepts supported video types', () => {
      expect(validateVideoFile(makeFile('video/mp4', 1000)).valid).toBe(true);
      expect(validateVideoFile(makeFile('video/webm', 1000)).valid).toBe(true);
    });

    it('rejects unsupported types', () => {
      const result = validateVideoFile(makeFile('image/jpeg', 1000));
      expect(result.valid).toBe(false);
    });

    it('rejects oversized files', () => {
      const result = validateVideoFile(makeFile('video/mp4', 501 * 1024 * 1024));
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/too large/i);
    });
  });

  describe('base64ToBlob', () => {
    it('round-trips a data URL', () => {
      const blob = base64ToBlob('data:image/png;base64,aGVsbG8=', 'image/png');
      expect(blob.type).toBe('image/png');
      expect(blob.size).toBe(5); // 'hello'
    });
  });
});
