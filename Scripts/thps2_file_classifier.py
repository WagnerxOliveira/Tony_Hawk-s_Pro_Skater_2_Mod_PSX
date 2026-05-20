import os
import shutil

def classificar_e_copiar_arquivos():
    # 1. Configuração de Caminhos (Atualizados para snake_case)
    diretorio_script = os.path.dirname(os.path.abspath(__file__))
    pasta_originais = os.path.join(diretorio_script, "..", "Arquivos_Originais")
    
    # Pasta RAW (A que vamos manter intacta)
    pasta_origem = os.path.join(pasta_originais, "Arquivos_Extraidos_WAD", "WAD_Desempacotado")
    
    # Pasta REFINADA (Onde as subpastas organizadas vão nascer)
    pasta_destino_base = os.path.join(pasta_originais, "Arquivos_Classificados")

    if not os.path.exists(pasta_origem):
        print(f"Erro Crítico: A pasta de origem não foi encontrada:\n{pasta_origem}")
        return

    # 2. Dicionário de Inteligência
    assinaturas_map = {
        "42 4D": ("Texturas_BMP", ".bmp"),
        "23 69 66 6E": ("Scripts_QB", ".qb"),
        "5F 54 52 47": ("Gatilhos_TRG", ".trg"),
        "70 42 41 56": ("Audio_VAG", ".vag"),
        "04 00 02 00": ("Geometria_3D", ".mdl"),
        "61 66 72 6F": ("Modelos_Especiais", ".afro")
    }

    contadores = {}
    print(f"🧹 Iniciando a Triagem Segura (Copiando e Classificando)...")

    # 3. O Loop de Triagem
    for nome_arquivo in os.listdir(pasta_origem):
        # Garante que só processa os arquivos .dat brutos
        if not nome_arquivo.endswith(".dat"):
            continue

        caminho_completo = os.path.join(pasta_origem, nome_arquivo)

        # Lê a assinatura magnética
        with open(caminho_completo, 'rb') as f:
            cabecalho = f.read(4)

        if len(cabecalho) < 4:
            continue

        hex_sig_completa = " ".join([f"{b:02X}" for b in cabecalho])
        hex_sig_2bytes = " ".join([f"{b:02X}" for b in cabecalho[:2]])

        # 4. Lógica de Identificação
        subpasta = "Desconhecidos_BIN"
        extensao = ".bin"

        if hex_sig_completa in assinaturas_map:
            subpasta, extensao = assinaturas_map[hex_sig_completa]
        elif hex_sig_2bytes == "42 4D":
            subpasta, extensao = assinaturas_map["42 4D"]

        # Cria a subpasta se não existir
        caminho_subpasta = os.path.join(pasta_destino_base, subpasta)
        os.makedirs(caminho_subpasta, exist_ok=True)

        # 5. Renomear e COPIAR (A grande mudança)
        novo_nome = nome_arquivo.replace(".dat", extensao)
        caminho_novo = os.path.join(caminho_subpasta, novo_nome)

        # Usando copy() para manter os arquivos originais na pasta WAD_Desempacotado
        shutil.copy(caminho_completo, caminho_novo)

        contadores[subpasta] = contadores.get(subpasta, 0) + 1

    # 6. Relatório Final
    print("\n✅ Triagem Concluída com Segurança Absoluta!")
    print("A pasta 'WAD_Desempacotado' foi MANTIDA INTACTA com todos os arquivos brutos.")
    print("As cópias classificadas foram organizadas em:")
    print("-" * 50)
    for categoria, qtd in sorted(contadores.items(), key=lambda x: x[1], reverse=True):
        print(f"📁 {categoria:<25} | {qtd} arquivos")
    print("-" * 50)

if __name__ == "__main__":
    classificar_e_copiar_arquivos()