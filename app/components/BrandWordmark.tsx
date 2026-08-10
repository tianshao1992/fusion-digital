type BrandWordmarkProps = {
  className?: string;
};

export default function BrandWordmark({className = ''}: BrandWordmarkProps) {
  return <span className={`brandWordmark${className ? ` ${className}` : ''}`}>
    <span className="brandFusion">Fusion</span><span className="brandDigital">Digital</span>
  </span>;
}
