import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { Icon } from './Icon';

interface ModalProps {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  danger?: boolean;
  submitDisabled?: boolean;
  children: ReactNode;
}

/** Native <dialog> gives focus trapping, Esc-to-close and a backdrop for free. */
export function Modal({ title, onClose, onSubmit, submitLabel, danger, submitDisabled, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal?.();
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (e.target === ref.current) onClose();
      }}
    >
      <form onSubmit={handleSubmit} className="modal__body">
        <header className="modal__head">
          <h2 className="title-lg">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        {children}
        <footer className="modal__actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={danger ? 'btn btn-danger' : 'btn btn-primary'} disabled={submitDisabled}>
            {submitLabel}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
