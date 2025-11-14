export const handleGoToPortal = () => {
    window.location.href = process.env.NEXT_PUBLIC_ELEARNING_PORTAL || ""; 
  };