"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { handleGoToPortal } from "@/utils/linkUtils";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

/**
 * Custom 404 page for the application.
 * This component is automatically rendered by Next.js when a route is not found.
 */
export default function NotFoundPage() {

  return (
    <main className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md text-center shadow-lg">
        <CardHeader>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full mb-4 bg-red-100">
            <AlertTriangle className="h-10 w-10 text-red-600" />
          </div>
          <CardTitle className="text-2xl font-bold">404 - Page Not Found</CardTitle>
          <CardDescription className="text-muted-foreground pt-2">
            Oops! The page you are looking for does not exist or has been moved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>
            Let&apos;s get you back on track. You can return to the homepage by clicking the button below.
          </p>
        </CardContent>
        <CardFooter>
          <Button className="w-full" size="lg" onClick={handleGoToPortal}>
            Return to Homepage
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
