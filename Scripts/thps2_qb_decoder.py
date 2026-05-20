import os
import re

def decodificar_scripts_qb():
    print("🧠 Iniciando a Engenharia Reversa dos Scripts Lógicos (.qb -> TXT)...")
    
    # 1. Configuração de Caminhos (Atualizados para a nova arquitetura)
    diretorio_script = os.path.dirname(os.path.abspath(__file__))
    
    # Origem: Busca os arquivos originais (.qb) dentro do cofre classificado
    pasta_origem = os.path.join(diretorio_script, "..", "Arquivos_Originais", "Arquivos_Classificados", "Scripts_QB")
    
    # Destino: Salva os scripts decodificados em formato de texto na área de trabalho limpa
    pasta_destino = os.path.join(diretorio_script, "..", "Arquivos_Trabalho", "Scripts_QB_TXT_Decodificados")
    
    if not os.path.exists(pasta_origem):
        print(f"Erro Crítico: A pasta de origem não foi encontrada:\n{pasta_origem}")
        return
        
    os.makedirs(pasta_destino, exist_ok=True)
    
    sucesso = 0
    print("-" * 60)
    
    # 2. O Loop de Extração
    for nome_arquivo in os.listdir(pasta_origem):
        if not nome_arquivo.endswith(".qb"):
            continue
            
        caminho_qb = os.path.join(pasta_origem, nome_arquivo)
        nome_original_sem_extensao = nome_arquivo.replace('.qb', '')
        
        with open(caminho_qb, 'rb') as f:
            dados_binarios = f.read()
            
            # 3. O Extrator de Inteligência Textual
            # Busca strings legíveis (letras, números, underlines) de 3 ou mais caracteres
            strings_encontradas = re.findall(b'[a-zA-Z0-9_ -]{3,}', dados_binarios)
            strings_decodificadas = [s.decode('ascii').strip() for s in strings_encontradas if len(s.strip()) > 2]
            
            # Tenta encontrar o nome interno do script para rastreabilidade
            nome_interno_limpo = "Script_Logico"
            for s in strings_decodificadas:
                if s not in ['ifn', 'ifndef', 'endif', 'null']:
                    nome_interno_limpo = re.sub(r'[\\/*?:"<>|]', "", s).strip()
                    break # Pega a primeira palavra válida como nome da tag
            
            # LÓGICA DE NOMEAÇÃO COMBINADA (Hash + Tag Interna)
            novo_nome = f"{nome_original_sem_extensao}_[{nome_interno_limpo}].txt"
            caminho_txt = os.path.join(pasta_destino, novo_nome)
            
            # 4. Geração do Relatório Legível
            with open(caminho_txt, 'w', encoding='utf-8') as f_out:
                f_out.write("====================================================\n")
                f_out.write(" 🧠 RELATÓRIO DE DECODIFICAÇÃO DE SCRIPT LÓGICO (.QB)\n")
                f_out.write("====================================================\n")
                f_out.write(f"Arquivo Original: {nome_arquivo}\n")
                f_out.write(f"Assinatura Identificada: #ifn (Neversoft Engine)\n")
                f_out.write(f"Tamanho do Bloco: {len(dados_binarios)} bytes\n")
                f_out.write("----------------------------------------------------\n\n")
                f_out.write("📋 TEXTOS E VARIÁVEIS EXTRAÍDOS:\n")
                f_out.write("(Diálogos, Nomes de Missões, Regras e Variáveis da Engine)\n\n")
                
                # Remove duplicatas mantendo a ordem para facilitar a leitura
                strings_vistas = set()
                for string_val in strings_decodificadas:
                    # Filtra lixo de código C++ comum nesses arquivos
                    if string_val not in strings_vistas and string_val not in ['ifn', 'ifndef', 'endif']:
                        f_out.write(f"-> {string_val}\n")
                        strings_vistas.add(string_val)
                        
        sucesso += 1
        print(f"✅ Decodificado e rastreado: {novo_nome}")

    print("-" * 60)
    print(f"🎉 Extração concluída! {sucesso} scripts gerados em 'Scripts_QB_TXT_Decodificados'.")

if __name__ == "__main__":
    decodificar_scripts_qb()