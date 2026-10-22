import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap overflow-hidden rounded-full text-sm font-medium ring-offset-background transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[0_1px_3px_rgba(0,0,0,0.12),0_4px_12px_hsl(var(--primary)/0.25)] hover:bg-primary/90 hover:shadow-[0_2px_8px_rgba(0,0,0,0.14),0_8px_20px_hsl(var(--primary)/0.3)]',
        destructive:
          'bg-destructive text-destructive-foreground shadow-[0_1px_3px_rgba(0,0,0,0.12),0_4px_12px_hsl(var(--destructive)/0.25)] hover:bg-destructive/90',
        outline:
          'border border-border bg-card text-foreground shadow-sm hover:bg-accent hover:border-primary/30 hover:text-primary',
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost:
          'bg-transparent shadow-none hover:bg-accent/60',
        link: 'bg-transparent text-primary shadow-none underline-offset-4 hover:underline',
        success:
          'bg-[#4B7A3E] text-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_4px_12px_rgba(75,122,62,0.3)] hover:bg-[#3d6633]',
        warning:
          'bg-[#E5A100] text-[#3d2e00] shadow-[0_1px_3px_rgba(0,0,0,0.12),0_4px_12px_rgba(229,161,0,0.3)] hover:bg-[#cc9000]',
      },
      size: {
        default: 'h-10 px-5',
        sm: 'h-8 px-3.5 text-xs',
        lg: 'h-11 px-7',
        xl: 'h-12 px-8 text-[15px]',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading ? (
          <>
            <svg
              className="mr-2 h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Loading...</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };