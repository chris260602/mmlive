import { Loader2 } from "lucide-react";

export const LoadingScreen = () => {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        {/* The spinning loader icon */}
        <Loader2 className="h-10 w-10 animate-spin text-primary" />

        {/* Informative text for the user */}
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">
            Loading
          </p>
          <p className="text-sm text-muted-foreground">
            Please wait while we get everything ready.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
