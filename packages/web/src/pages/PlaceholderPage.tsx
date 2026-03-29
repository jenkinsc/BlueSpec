interface Props {
  title: string;
}

export function PlaceholderPage({ title }: Props) {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      <p className="mt-2 text-sm text-gray-500">Coming soon.</p>
    </div>
  );
}
