// ponytail: plain text, not a link — no ratoguras.com URL was confirmed. Wrap the
// name in an <a> once there is one.
export function SiteCredit({ className }: { className?: string }) {
  return (
    <p className={className}>
      Developed by <span className="font-medium">Rato Guras Technology</span>
    </p>
  );
}
