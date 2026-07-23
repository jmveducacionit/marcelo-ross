/** Ícono Material Symbols (fuente self-hosted). Uso: <Icon name="shopping_cart" /> */
export function Icon({ name, className = '', fill = false }: { name: string; className?: string; fill?: boolean }) {
  return <span className={`material-symbols-outlined ${fill ? 'fill' : ''} ${className}`}>{name}</span>;
}
