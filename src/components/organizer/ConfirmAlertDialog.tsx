import { AlertTriangle } from 'lucide-react';

interface ConfirmAlertDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'amber' | 'red';
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Shared destructive/overwrite confirmation dialog for organizer actions. */
export function ConfirmAlertDialog({
  title,
  description,
  confirmLabel,
  tone = 'amber',
  busy = false,
  onCancel,
  onConfirm
}: ConfirmAlertDialogProps) {
  const isRed = tone === 'red';
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className={`p-4 rounded-xl border space-y-3 ${
        isRed
          ? 'border-red-400/55 bg-red-950/85 text-red-100'
          : 'border-amber-400/50 bg-amber-950/85 text-amber-100'
      }`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={`w-5 h-5 shrink-0 mt-0.5 ${isRed ? 'text-red-300' : 'text-amber-400'}`}
          aria-hidden="true"
        />
        <div className="space-y-1">
          <h4 className={`font-bold text-sm ${isRed ? 'text-red-200' : 'text-amber-200'}`}>
            {title}
          </h4>
          <p className={`text-xs leading-relaxed ${isRed ? 'text-red-100/90' : 'text-amber-100/90'}`}>
            {description}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          className={`tappable h-9 px-3.5 rounded-lg border bg-transparent text-xs font-semibold ${
            isRed
              ? 'border-red-300/35 text-red-100 hover:bg-red-900/40'
              : 'border-amber-400/40 text-amber-200 hover:bg-amber-900/40'
          }`}
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className={`tappable h-9 px-4 rounded-lg font-bold text-xs disabled:opacity-50 ${
            isRed
              ? 'bg-red-500 text-white hover:bg-red-400'
              : 'bg-amber-400 text-amber-950 hover:bg-amber-300'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
