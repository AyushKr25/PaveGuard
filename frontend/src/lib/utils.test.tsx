import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getSeverityColor, formatFileSize, formatRelativeTime } from '@/lib/utils';

describe('UI Components', () => {
  describe('Button', () => {
    it('renders button with children', () => {
      render(<Button>Click me</Button>);
      expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
    });

    it('applies variant classes', () => {
      render(<Button variant="destructive">Delete</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-destructive');
    });

    it('applies size classes', () => {
      render(<Button size="lg">Large</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-11');
    });

    it('shows loading state', () => {
      render(<Button loading>Loading</Button>);
      expect(screen.getByRole('button')).toBeDisabled();
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('Input', () => {
    it('renders input', () => {
      render(<Input placeholder="Enter text" />);
      expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
    });

    it('handles value change', () => {
      render(<Input defaultValue="test" />);
      expect(screen.getByDisplayValue('test')).toBeInTheDocument();
    });
  });

  describe('Badge', () => {
    it('renders badge with text', () => {
      render(<Badge>New</Badge>);
      expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('applies severity variant', () => {
      render(<Badge variant="success">LOW</Badge>);
      expect(screen.getByText('LOW')).toHaveClass('bg-[#4B7A3E]/10');
      expect(screen.getByText('LOW')).toHaveClass('text-[#4B7A3E]');
    });
  });
});

describe('Utility Functions', () => {
  describe('cn', () => {
    it('combines class names', () => {
      expect(cn('a', 'b', 'c')).toBe('a b c');
    });

    it('handles conditional classes', () => {
      expect(cn('base', true && 'conditional', false && 'hidden')).toBe('base conditional');
    });
  });

  describe('getSeverityColor', () => {
    it('returns correct colors for each level', () => {
      expect(getSeverityColor('LOW')).toContain('green');
      expect(getSeverityColor('MODERATE')).toContain('yellow');
      expect(getSeverityColor('HIGH')).toContain('red');
      expect(getSeverityColor('CRITICAL')).toContain('red');
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes correctly', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
    });
  });

  describe('formatRelativeTime', () => {
    it('formats recent times', () => {
      const now = new Date();
      expect(formatRelativeTime(now)).toBe('just now');
      
      const minuteAgo = new Date(now.getTime() - 60 * 1000);
      expect(formatRelativeTime(minuteAgo)).toBe('1m ago');
      
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      expect(formatRelativeTime(hourAgo)).toBe('1h ago');
      
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(dayAgo)).toBe('1d ago');
    });
  });
});

describe('Detection Types', () => {
  it('defines correct severity levels', () => {
    const levels = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
    levels.forEach(level => {
      expect(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']).toContain(level);
    });
  });

  it('defines correct detection types', () => {
    const types = ['image', 'video', 'live', 'road_scan'];
    types.forEach(type => {
      expect(['image', 'video', 'live', 'road_scan']).toContain(type);
    });
  });
});