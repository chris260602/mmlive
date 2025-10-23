import { SignalHigh, SignalLow, SignalMedium, XIcon } from "lucide-react";

const NetworkIndicator = ({ strength = 'disconnected' }) => {
  const iconProps = {
    className: "w-4 h-4 transition-all duration-300 ease-in-out",
  };

  const getIcon = () => {
    switch (strength) {
      case 'excellent':
        return <SignalHigh {...iconProps} className={`${iconProps.className} text-green-500`} title="Excellent Connection" />;
      case 'good':
        return <SignalMedium {...iconProps} className={`${iconProps.className} text-yellow-500`} title="Good Connection" />;
      case 'poor':
        return <SignalLow {...iconProps} className={`${iconProps.className} text-orange-500`} title="Poor Connection" />;
      case 'disconnected':
      default:
        return <XIcon {...iconProps} className={`${iconProps.className} text-red-500`} title="Disconnected" />;
    }
  };

  return (
    <div className="animate-fade-in-scale">
      {getIcon()}
    </div>
  );
};

export default NetworkIndicator