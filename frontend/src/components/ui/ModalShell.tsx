import type { ReactNode } from 'react';
import Modal from './Modal';

type ModalShellProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
};

export default function ModalShell({
  title,
  open,
  onClose,
  children,
  actions,
}: ModalShellProps): JSX.Element | null {
  return (
    <Modal
      title={title}
      open={open}
      onClose={onClose}
      footer={actions ? <div className="flex justify-end gap-2">{actions}</div> : undefined}
    >
      {children}
    </Modal>
  );
}
