import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:bg-accent-hover",
        secondary: "border bg-background text-foreground hover:bg-surface",
        ghost: "text-foreground hover:bg-surface",
        danger: "bg-error text-white hover:opacity-90",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-10 rounded-[6px] px-3.5 text-sm md:h-8 md:px-3 md:text-sm md:text-[13px]",
        md: "h-11 rounded-[8px] px-4 text-[15px] md:h-10 md:rounded-[6px] md:text-sm",
        lg: "h-12 rounded-[10px] px-5 text-base md:h-11 md:rounded-[8px] md:text-[15px]",
        icon: "size-11 rounded-[8px] md:size-10 md:rounded-[6px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = "Button";
export { buttonVariants };
