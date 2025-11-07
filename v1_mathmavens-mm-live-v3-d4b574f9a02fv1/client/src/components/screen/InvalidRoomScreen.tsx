import Link from "next/link"
import { Button } from "../ui/button"
import { handleGoToPortal } from "@/utils/linkUtils"

export default function InvalidRoomScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg border border-gray-200">
        <div className="p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">This Room Can’t Be Found</h1>
          <p className="text-gray-600 mb-6">It looks like the room link is incorrect or expired. Please check your link or create a new room.</p>
        </div>

        <div className="px-6 pb-6 space-y-6">
          <div className="space-y-3">
            <Button
              onClick={handleGoToPortal}
              className="w-full text-white font-medium py-2 px-4 rounded-md transition-colors duration-200 flex items-center justify-center"
            >
              <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
              Go to Homepage
            </Button>

            {/* <Link
              href="/contact"
              className="w-full bg-transparent hover:bg-gray-50 text-gray-600 font-medium py-2 px-4 rounded-md transition-colors duration-200 flex items-center justify-center"
            >
              <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              Contact Support
            </Link> */}
          </div>

          <div className="text-center">
            <p className="text-xs text-gray-400">Error Code: 403 - Forbidden</p>
          </div>
        </div>
      </div>
    </div>
  )
}