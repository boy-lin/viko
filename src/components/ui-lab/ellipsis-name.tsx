import { cn } from "@/lib/utils";

type EllipsisNameProps = {
  name?: string;
  className?: string;
  startCount?: number;
  endCount?: number;
};

const getEllipsisName = (name: string | undefined, startCount: number, endCount: number) => {
  if (!name) return "";
  if (name.length <= startCount + endCount + 1) return name;
  return `${name.slice(0, startCount)}...${name.slice(-endCount)}`;
};

export const EllipsisName = ({
  name,
  className,
  startCount = 6,
  endCount = 6,
}: EllipsisNameProps) => {
  const displayName = getEllipsisName(name, startCount, endCount);

  return (
    <span
      className={cn("text-sm text-center", className)}
      title={name}
    >
      {displayName}
    </span>
  );
};
