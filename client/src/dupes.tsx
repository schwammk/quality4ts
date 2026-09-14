import type { ReportDataset } from './types.js';

export function Duplicates(props: {
  dataset: ReportDataset;
  onOpenPair: (leftFile: string, leftLine: number, rightFile: string, rightLine: number) => void;
}) {
  const { dataset, onOpenPair } = props;
  const pairs = [...dataset.duplicates].sort((a, b) => b.score - a.score);
  return (
    <table>
      <thead>
        <tr>
          <th>Score</th>
          <th>Left</th>
          <th>Right</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {pairs.map((p, i) => (
          <tr key={`${p.left.file}:${p.left.startLine}:${p.right.file}:${p.right.startLine}:${i}`}>
            <td>{p.score.toFixed(2)}</td>
            <td>{p.left.file}:{p.left.startLine}</td>
            <td>{p.right.file}:{p.right.startLine}</td>
            <td>
              <button onClick={() => onOpenPair(p.left.file, p.left.startLine, p.right.file, p.right.startLine)}>Open</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
