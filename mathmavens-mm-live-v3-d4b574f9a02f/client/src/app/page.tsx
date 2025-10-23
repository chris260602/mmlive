"use client"
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Compass } from "lucide-react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  // This function will navigate the user to the main lobby or room page.
  // Change '/stream' to your application's main entry point if it's different.
  const handleNavigate = () => {
    router.push(process.env.NEXT_PUBLIC_ELEARNING_PORTAL || ""); // Or '/lobby', '/join', etc.
  };

  return (
    <main className="flex items-center justify-center min-h-screen p-4">
    <Card className="w-full max-w-md text-center shadow-lg">
      <CardHeader>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 mb-4">
          <Compass className="h-10 w-10" />
        </div>
        <CardTitle className="text-2xl font-bold">Are You Lost?</CardTitle>
        <CardDescription className="text-muted-foreground pt-2">
          It seems you&apos;ve found our starting point, but the live classes happens elsewhere!
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p>
          This page is just a signpost. Click the button below to head over to the right place to join your session.
        </p>
      </CardContent>
      <CardFooter>
        <Button onClick={handleNavigate} className="w-full" size="lg">
          Take Me there!
        </Button>
      </CardFooter>
    </Card>
  </main>
  );
}
