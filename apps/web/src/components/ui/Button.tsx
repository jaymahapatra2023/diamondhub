import { forwardRef } from 'react'
import clsx from 'clsx'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading,
      className,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={clsx(
          'inline-flex items-center justify-center font-semibold rounded-xl transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          // Size — P1: minimum 44px height
          size === 'sm' && 'h-10 px-4 text-sm',
          size === 'md' && 'h-12 px-6 text-base',
          size === 'lg' && 'h-14 px-8 text-lg',
          // Variants
          variant === 'primary' &&
            'bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700',
          variant === 'secondary' &&
            'bg-gray-800 text-white hover:bg-gray-700 active:bg-gray-900',
          variant === 'ghost' && 'bg-transparent text-gray-300 hover:bg-gray-800',
          variant === 'danger' && 'bg-red-600 text-white hover:bg-red-500',
          className,
        )}
        {...props}
      >
        {isLoading ? (
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
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
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          children
        )}
      </button>
    )
  },
)
Button.displayName = 'Button'
