import os
import re

def decodificar_gatilhos_trg():
    print("🎯 Iniciando a Engenharia Reversa dos Gatilhos (_TRG -> TXT)...")
    
    # 1. Configuração de Caminhos (Atualizados para a nova arquitetura)
    diretorio_script = os.path.dirname(os.path.abspath(__file__))
    
    # Origem: Busca os arquivos originais (.trg) dentro do cofre classificado
    pasta_origem = os.path.join(diretorio_script, "..", "Arquivos_Originais", "Arquivos_Classificados", "Gatilhos_TRG")
    
    # Destino: Salva os relatórios em texto na área de trabalho limpa
    pasta_destino = os.path.join(diretorio_script, "..", "Arquivos_Trabalho", "Gatilhos_TXT_Decodificados")
    
    if not os.path.exists(pasta_origem):
        print(f"Erro Crítico: A pasta de origem não foi encontrada:\n{pasta_origem}")
        return
        
    os.makedirs(pasta_destino, exist_ok=True)
    
    sucesso = 0
    print("-" * 60)
    
    # 2. O Loop de Extração
    for nome_arquivo in os.listdir(pasta_origem):
        if not nome_arquivo.endswith(".trg"):
            continue
            
        caminho_trg = os.path.join(pasta_origem, nome_arquivo)
        nome_original_sem_extensao = nome_arquivo.replace('.trg', '')
        
        with open(caminho_trg, 'rb') as f:
            dados_binarios = f.read()
            
            # Verifica se o Magic Number _TRG está no início do arquivo
            if dados_binarios[:4] != b'_TRG':
                continue
                
            # 3. O Extrator de Inteligência (Buscando texto humano no meio do código de máquina)
            # A expressão regular abaixo busca qualquer sequência de 4 ou mais caracteres ASCII legíveis
            strings_encontradas = re.findall(b'[ -~]{4,}', dados_binarios)
            strings_decodificadas = [s.decode('ascii') for s in strings_encontradas]
            
            # Tenta encontrar o nome interno da pista ou do gatilho principal
            # Geralmente é a primeira string relevante após o '_TRG'
            nome_interno_limpo = "Gatilhos_Mapeamento"
            for s in strings_decodificadas:
                if s != '_TRG':
                    nome_interno_limpo = re.sub(r'[\\/*?:"<>|]', "", s).strip()
                    break
            
            # LÓGICA DE NOMEAÇÃO COMBINADA (Rastreabilidade)
            novo_nome = f"{nome_original_sem_extensao}_[{nome_interno_limpo}].txt"
            caminho_txt = os.path.join(pasta_destino, novo_nome)
            
            # 4. Geração do Relatório Legível
            with open(caminho_txt, 'w', encoding='utf-8') as f_out:
                f_out.write("====================================================\n")
                f_out.write(" 🎯 RELATÓRIO DE MAPEAMENTO DE GATILHOS (TRIGGERS) \n")
                f_out.write("====================================================\n")
                f_out.write(f"Arquivo Original: {nome_arquivo}\n")
                f_out.write(f"Assinatura Identificada: _TRG\n")
                f_out.write(f"Tamanho do Bloco: {len(dados_binarios)} bytes\n")
                f_out.write("----------------------------------------------------\n\n")
                f_out.write("📋 STRINGS INTERNAS ENCONTRADAS:\n")
                f_out.write("(Nomes de Gaps, Objetivos, Scripts de Colisão e Nós 3D)\n\n")
                
                for string_val in strings_decodificadas:
                    if string_val != '_TRG':
                        f_out.write(f"-> {string_val}\n")
                        
            sucesso += 1
            print(f"✅ Decodificado e rastreado: {novo_nome}")

    print("-" * 60)
    print(f"🎉 Extração concluída! {sucesso} mapeamentos gerados em 'Gatilhos_TXT_Decodificados'.")

if __name__ == "__main__":
    decodificar_gatilhos_trg()