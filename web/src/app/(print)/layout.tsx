import "./print.css";

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="print-root bg-white text-black">{children}</div>;
}
