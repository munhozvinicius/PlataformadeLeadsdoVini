export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import * as XLSX from "xlsx";

export async function GET() {
  const headers = [
    "UF",
    "CIDADE",
    "DOCUMENTO",
    "EMPRESA",
    "CD_CNAE",
    "VL_FAT_PRESUMIDO",
    "TELEFONE1",
    "TELEFONE2",
    "TELEFONE3",
    "LOGRADOURO",
    "Território",
    "OFERTA MKT",
    "CEP",
    "NUMERO",
    "ESTRATEGIA",
    "ARMÁRIO",
    "ID PRUMA",
    "VERTICAL",
  ];
  const worksheet = XLSX.utils.aoa_to_sheet([headers]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "modelo");
  const arrayBuffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  return new Response(blob, {
    status: 200,
    headers: {
      "Content-Disposition": 'attachment; filename="modelo_base_leads.xlsx"',
    },
  });
}
