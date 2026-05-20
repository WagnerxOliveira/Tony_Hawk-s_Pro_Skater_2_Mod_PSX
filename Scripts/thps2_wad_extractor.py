import os
import struct

def extrair_wad():
    # 1. Configuração de Caminhos Relativos (Atualizados para a nova estrutura snake_case)
    diretorio_script = os.path.dirname(os.path.abspath(__file__))
    
    # Navega para a pasta mãe "Arquivos_Originais"
    pasta_originais = os.path.join(diretorio_script, "..", "Arquivos_Originais")
    
    # Caminho onde estão o HED e WAD originais
    pasta_cdmage = os.path.join(pasta_originais, "Arquivos_Extraidos_CDmage")
    caminho_hed = os.path.join(pasta_cdmage, "CD.HED")
    caminho_wad = os.path.join(pasta_cdmage, "CD.WAD")
    
    # Define o novo destino exato conforme a sua organização no VS Code
    pasta_destino = os.path.join(pasta_originais, "Arquivos_Extraidos_WAD", "WAD_Desempacotado")

    # 2. Validação de Segurança
    if not os.path.exists(caminho_hed) or not os.path.exists(caminho_wad):
        print(f"Erro Crítico: CD.HED ou CD.WAD não encontrados na pasta:\n{pasta_cdmage}")
        return

    # Cria a pasta de destino se ela ainda não existir
    os.makedirs(pasta_destino, exist_ok=True)

    # 3. Abertura do Índice e do Baú de Dados
    with open(caminho_hed, 'rb') as f_hed, open(caminho_wad, 'rb') as f_wad:
        hed_dados = f_hed.read()
        total_blocos = len(hed_dados) // 12
        arquivos_extraidos = 0

        print(f"🚀 Iniciando extração cirúrgica do WAD...")
        print(f"📂 Destino: {pasta_destino}\n")

        # 4. O Loop de Extração
        for i in range(total_blocos):
            bloco = hed_dados[i*12 : (i+1)*12]
            
            if len(bloco) < 12:
                break

            # Desempacota o Little Endian
            hash_val, offset_val, size_val = struct.unpack('<III', bloco)

            # Verifica o End of File (Padding de Zeros)
            if hash_val == 0 and offset_val == 0 and size_val == 0:
                break

            # Formata o nome do arquivo usando o ID numérico e o Hash
            nome_arquivo = f"{i+1:04d}_{hash_val:08X}.dat"
            caminho_saida = os.path.join(pasta_destino, nome_arquivo)

            # O bisturi: Pula para o Offset exato no WAD e lê apenas o Tamanho necessário
            f_wad.seek(offset_val)
            dados_arquivo = f_wad.read(size_val)

            # Salva o arquivo fatiado no disco
            with open(caminho_saida, 'wb') as f_out:
                f_out.write(dados_arquivo)

            arquivos_extraidos += 1

            # Print de progresso no terminal
            if arquivos_extraidos % 100 == 0:
                print(f"⏳ Extraídos: {arquivos_extraidos} arquivos...")

        print(f"\n✅ Sucesso Absoluto! Todos os {arquivos_extraidos} arquivos foram extraídos do CD.WAD.")

if __name__ == "__main__":
    extrair_wad()