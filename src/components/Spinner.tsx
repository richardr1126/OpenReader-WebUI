// Loading spinner component
export function LoadingSpinner() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="animate-spin h-4 w-4 border-2 border-foreground border-t-transparent rounded-full" />
    </div>
  );
}