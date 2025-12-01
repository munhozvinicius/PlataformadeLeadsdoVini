export type ImportTemplate = {
  id: string;
  label: string;
  description: string;
  columns: string[];
  sampleRows: Record<string, string>[];
};

export const importTemplates: ImportTemplate[] = [
  {
    id: "cockpit-portal-info",
    label: "Cockpit Portal Info",
    description:
      "Padrao de planilha para leads do tipo Cockpit Portal Info. Use este modelo para garantir que os campos obrigatorios estejam presentes antes de subir o arquivo.",
    columns: [
      "UF",
      "CIDADE",
      "DOCUMENTO",
      "EMPRESA",
      "CD_CNAE",
      "VL_FAT_PRESUMIDO",
      "TELEFONE2",
      "TELEFONE1",
      "TELEFONE3",
      "LOGRADOURO",
      "TERRITORIO",
      "OFERTA MKT",
      "CEP",
      "NUMERO",
      "ESTRATEGIA",
      "ARMARIO",
      "ID PRUMA",
      "VERTICAL",
    ],
    sampleRows: [
      {
        UF: "SP",
        CIDADE: "RIBEIRAO PRETO",
        DOCUMENTO: "3278377000103",
        EMPRESA: "A. A. DOS SANTOS INDUSTRIA METALURGICA",
        CD_CNAE: "2599302",
        VL_FAT_PRESUMIDO: "R$ 110,000,00",
        TELEFONE2: "",
        TELEFONE1: "",
        TELEFONE3: "",
        LOGRADOURO: "JARDINOPOLIS, 1105, ND",
        TERRITORIO: "RIBEIRAO PRETO",
        "OFERTA MKT": "REGIONAL",
        CEP: "14075560",
        NUMERO: "1105",
        ESTRATEGIA: "ADESAO AVANCADOS",
        ARMARIO: "11529NR",
        "ID PRUMA": "0",
        VERTICAL: "INDUSTRIA",
      },
      {
        UF: "SP",
        CIDADE: "RIBEIRAO PRETO",
        DOCUMENTO: "21399532000113",
        EMPRESA: "A. M. DE OLIVEIRA MANUTENCAO",
        CD_CNAE: "3321000",
        VL_FAT_PRESUMIDO: "R$ 110,000,00",
        TELEFONE2: "16981625912",
        TELEFONE1: "16982336462",
        TELEFONE3: "16997599615",
        LOGRADOURO: "SILVIO AUGUSTO FACCIO, 342, ND",
        TERRITORIO: "RIBEIRAO PRETO",
        "OFERTA MKT": "REGIONAL",
        CEP: "14030640",
        NUMERO: "342",
        ESTRATEGIA: "ADESAO AVANCADOS",
        ARMARIO: "11529SO",
        "ID PRUMA": "0",
        VERTICAL: "INDUSTRIA",
      },
    ],
  },
];
