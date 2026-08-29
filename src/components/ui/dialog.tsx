"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

// ---- Dialog Context ----
interface DialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue>({
  open: false,
  setOpen: () => {},
});

// ---- Dialog Root ----
interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function Dialog({ open: controlledOpen, onOpenChange, children }: DialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = React.useCallback(
    (value: boolean) => {
      if (!isControlled) setInternalOpen(value);
      onOpenChange?.(value);
    },
    [isControlled, onOpenChange]
  );

  return (
    <DialogContext.Provider value={{ open, setOpen }}>
      {children}
    </DialogContext.Provider>
  );
}

// ---- Dialog Trigger ----
interface DialogTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

const DialogTrigger = React.forwardRef<HTMLButtonElement, DialogTriggerProps>(
  ({ onClick, ...props }, ref) => {
    const { setOpen } = React.useContext(DialogContext);
    return (
      <button
        ref={ref}
        onClick={(e) => {
          setOpen(true);
          onClick?.(e);
        }}
        {...props}
      />
    );
  }
);
DialogTrigger.displayName = "DialogTrigger";

// ---- Dialog Portal + Overlay + Content ----
interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  onClose?: () => void;
}

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, onClose, ...props }, ref) => {
    const { open, setOpen } = React.useContext(DialogContext);

    // Close on Escape
    React.useEffect(() => {
      if (!open) return;
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setOpen(false);
          onClose?.();
        }
      };
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }, [open, setOpen, onClose]);

    if (!open) return null;
    // Rendered into <body>, not in place. A `position: fixed` box is only
    // viewport-relative while no ancestor establishes a containing block for
    // it, and a filling transform animation does exactly that in Chrome - so
    // any dialog opened from inside a card carrying our `insight-enter`
    // entrance was laying its "cover the screen" overlay over the card alone.
    // The page behind stayed undimmed and the panel centred itself on the card
    // instead of the window, spilling off the top and bottom with no way to
    // scroll to what was cut off. A portal puts the dialog beyond the reach of
    // whatever the trigger happens to be nested in.
    if (typeof document === "undefined") return null;

    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Overlay */}
        <div
          className="fixed inset-0 bg-wolf-black/80 backdrop-blur-sm animate-in fade-in-0"
          onClick={() => {
            setOpen(false);
            onClose?.();
          }}
        />
        {/* Content */}
        <div
          ref={ref}
          className={cn(
            "relative z-50 w-full max-w-lg rounded-xl bg-wolf-surface border border-wolf-border shadow-2xl",
            "animate-in fade-in-0 zoom-in-95 slide-in-from-top-2",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </div>,
      document.body
    );
  }
);
DialogContent.displayName = "DialogContent";

// ---- Dialog Header ----
const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 p-6 pb-4",
      className
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

// ---- Dialog Title ----
const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight text-snow-peak",
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

// ---- Dialog Description ----
const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-mist", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
};
