import { Icon } from '../ui/Icon';

export function EnConstruccion({ titulo, icon, detalle }: { titulo: string; icon: string; detalle: string }) {
  return (
    <div className="flex-1 grid place-items-center p-8">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-full grid place-items-center bg-surface-container-high mx-auto mb-4">
          <Icon name={icon} className="text-3xl text-primary" />
        </div>
        <h1 className="font-display text-3xl text-on-surface mb-2">{titulo}</h1>
        <p className="text-on-surface-variant">{detalle}</p>
        <div className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-wider text-on-tertiary-container bg-gold-wash/40 px-3 py-1.5 rounded">
          <Icon name="construction" className="text-sm" /> En construcción
        </div>
      </div>
    </div>
  );
}
