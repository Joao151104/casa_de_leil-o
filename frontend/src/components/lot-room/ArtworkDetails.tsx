import { ArrowUpRight } from 'lucide-react';
import type { Lot } from '@/lib/types';

/** Ficha da obra: descrição do leiloeiro e atributos copiados do acervo. */
export function ArtworkDetails({ lot }: { lot: Lot }) {
  const { attributes } = lot;
  const rows: Array<[string, string | null | undefined]> = [
    ['Artista', attributes.artist],
    ['Biografia', attributes.artistBio],
    ['Data', attributes.date],
    ['Técnica', attributes.medium],
    ['Dimensões', attributes.dimensions],
    ['Cultura', attributes.culture],
    ['Classificação', attributes.classification],
    ['Departamento', attributes.department],
    ['Procedência', attributes.creditLine],
  ];

  return (
    <div className="mt-10">
      <h2 className="border-b pb-2 font-display text-lg">Sobre a obra</h2>
      {lot.description && <p className="mt-4 leading-relaxed">{lot.description}</p>}
      <dl className="mt-2">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="grid grid-cols-[8rem_1fr] gap-4 border-b py-2.5 text-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      {attributes.objectUrl && (
        <a
          href={attributes.objectUrl}
          target="_blank"
          rel="noreferrer"
          className="label-mono mt-4 inline-flex items-center gap-1 hover:text-signal"
        >
          Ver no acervo do Met <ArrowUpRight className="size-3" />
        </a>
      )}
    </div>
  );
}
