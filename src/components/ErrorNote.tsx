import { t } from '../strings';

export default function ErrorNote({ show, text }: { show: boolean; text?: string }) {
  if (!show) return null;
  return <p className="note" role="alert">{text ?? t.common.somethingWrong}</p>;
}
