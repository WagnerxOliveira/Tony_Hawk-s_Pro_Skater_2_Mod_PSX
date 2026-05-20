import os
from collections import Counter

def censo_magic_numbers():
    # 1. Configuração de Caminhos (Atualizados para snake_case)
    diretorio_script = os.path.dirname(os.path.abspath(__file__))
    pasta_originais = os.path.join(diretorio_script, "..", "Arquivos_Originais")
    pasta_alvo = os.path.join(pasta_originais, "Arquivos_Extraidos_WAD", "WAD_Desempacotado")

    if not os.path.exists(pasta_alvo):
        print(f"Erro Crítico: A pasta alvo não foi encontrada:\n{pasta_alvo}")
        return

    # Contador para armazenar quantas vezes cada assinatura aparece
    assinaturas_contador = Counter()
    total_lido = 0

    print(f"🔍 Iniciando varredura profunda de Magic Numbers...")
    print(f"📂 Lendo diretório: {pasta_alvo}\n")

    # 2. O Loop de Varredura
    for nome_arquivo in os.listdir(pasta_alvo):
        if nome_arquivo.endswith(".dat"):
            caminho_completo = os.path.join(pasta_alvo, nome_arquivo)
            
            with open(caminho_completo, 'rb') as f:
                cabecalho = f.read(4) # Lê apenas os primeiros 4 bytes
                
                # Ignora arquivos que tenham menos de 4 bytes (vazios/corrompidos)
                if len(cabecalho) == 4:
                    # Formata em Hexadecimal (ex: "10 00 00 00")
                    hex_sig = " ".join([f"{b:02X}" for b in cabecalho])
                    
                    # Tenta traduzir para ASCII (como a coluna direita do HxD)
                    # Se o byte for um caractere legível, mostra a letra. Se não, mostra um ponto "."
                    ascii_sig = "".join([chr(b) if 32 <= b <= 126 else '.' for b in cabecalho])
                    
                    # Combina a assinatura Hex com a ASCII para o nosso relatório
                    assinatura_completa = f"[{hex_sig}] ({ascii_sig})"
                    
                    assinaturas_contador[assinatura_completa] += 1
                    total_lido += 1

    # 3. Impressão do Relatório Final
    print("📊 RESULTADO DO CENSO DE ASSINATURAS (TOP MAGIC NUMBERS):")
    print("-" * 65)
    print(f"{'Assinatura Hexadecimal (ASCII)':<35} | {'Quantidade'}")
    print("-" * 65)
    
    # Imprime do mais comum para o menos comum
    for assinatura, quantidade in assinaturas_contador.most_common():
        print(f"{assinatura:<35} | {quantidade} arquivos")
        
    print("-" * 65)
    print(f"✅ Varredura concluída. {total_lido} arquivos lidos com sucesso.")

if __name__ == "__main__":
    censo_magic_numbers()