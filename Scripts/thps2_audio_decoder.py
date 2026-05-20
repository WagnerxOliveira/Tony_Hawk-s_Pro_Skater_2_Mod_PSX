import os
import struct
import wave
import re

def decodificar_audio_psx():
    print("🎵 Iniciando a Engenharia Reversa do Áudio (VAG/VAB -> WAV) com Rastreabilidade...")
    
    # 1. Configuração de Caminhos
    diretorio_script = os.path.dirname(os.path.abspath(__file__))
    pasta_base = os.path.join(diretorio_script, "..", "Arquivos Originais", "Arquivos Classificados")
    
    pasta_origem = os.path.join(pasta_base, "Audio_VAG")
    pasta_destino = os.path.join(pasta_base, "Audio_WAV_Convertidos")
    
    if not os.path.exists(pasta_origem):
        print(f"Erro Crítico: A pasta de origem não foi encontrada:\n{pasta_origem}")
        return
        
    os.makedirs(pasta_destino, exist_ok=True)
    
    # 2. Matriz de Filtros de Descompressão SPU do PlayStation 1
    predict_f1 = [0.0, 0.9375, 1.796875, 1.53125, 1.90625]
    predict_f2 = [0.0, 0.0, -0.8125, -0.859375, -0.9375]
    
    sucesso = 0
    print("-" * 60)
    
    # 3. O Loop de Decodificação
    for nome_arquivo in os.listdir(pasta_origem):
        if not nome_arquivo.endswith(".vag"):
            continue
            
        caminho_vag = os.path.join(pasta_origem, nome_arquivo)
        nome_original_sem_extensao = nome_arquivo.replace('.vag', '')
        
        with open(caminho_vag, 'rb') as f:
            cabecalho_magico = f.read(4)
            
            # CENÁRIO 1: É um arquivo de som individual padrão
            if cabecalho_magico == b'VAGp':
                resto_cabecalho = f.read(44)
                _, _, data_size, sample_rate = struct.unpack('>IIII', resto_cabecalho[0:16])
                
                # Extrai e limpa o nome interno da Neversoft
                nome_interno_bruto = resto_cabecalho[28:44].decode('ascii', errors='ignore').strip('\x00').strip()
                nome_interno_limpo = re.sub(r'[\\/*?:"<>|]', "", nome_interno_bruto).strip()
                adpcm_data = f.read(data_size)
                
            # CENÁRIO 2: É um Banco de Áudio da Neversoft (O nosso caso!)
            elif cabecalho_magico == b'pBAV':
                f.seek(0)
                adpcm_data = f.read() # Puxa o banco inteiro para a memória (Raw Dump)
                sample_rate = 22050   # Frequência universal da engine do THPS2
                nome_interno_limpo = "Banco_VAB_Bruto"
                
            # Se não for nenhum dos dois, ignora e pula
            else:
                continue 
            
        # LÓGICA DE NOMEAÇÃO COMBINADA (Rastreabilidade)
        if not nome_interno_limpo or len(nome_interno_limpo) < 2:
            novo_nome = f"{nome_original_sem_extensao}.wav"
        else:
            novo_nome = f"{nome_original_sem_extensao}_[{nome_interno_limpo}].wav"
            
        # 4. Algoritmo ADPCM -> PCM (Processamento Digital do PS1)
        pcm_data = bytearray()
        s1 = 0.0
        s2 = 0.0
        
        for i in range(0, len(adpcm_data), 16):
            bloco = adpcm_data[i:i+16]
            if len(bloco) < 16: break
            
            predict = (bloco[0] >> 4) & 0x0F
            shift = bloco[0] & 0x0F
            flags = bloco[1]
            
            if flags == 7: # Fim do fluxo de áudio
                break
                
            for j in range(2, 16):
                byte_val = bloco[j]
                nibbles = [byte_val & 0x0F, (byte_val >> 4) & 0x0F]
                
                for nibble in nibbles:
                    sample = nibble
                    if sample >= 8: sample -= 16
                    
                    shift_val = 12 - shift
                    if shift_val >= 0:
                        sample = sample << shift_val
                    else:
                        sample = sample >> (-shift_val)
                    
                    if predict < 5:
                        sample = sample + (s1 * predict_f1[predict]) + (s2 * predict_f2[predict])
                    
                    # Limita o volume (16-bit)
                    if sample > 32767: sample = 32767
                    elif sample < -32768: sample = -32768
                    
                    s2 = s1
                    s1 = sample
                    
                    pcm_data.extend(struct.pack('<h', int(sample)))
        
        # 5. Criando o arquivo .WAV compatível com Windows
        caminho_wav = os.path.join(pasta_destino, novo_nome)
        
        with wave.open(caminho_wav, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(pcm_data)
            
        sucesso += 1
        print(f"✅ Extraído e rastreado: {novo_nome}")

    print("-" * 60)
    print(f"🎉 Engenharia concluída! {sucesso} bancos de áudio gerados na pasta 'Audio_WAV_Convertidos'.")

if __name__ == "__main__":
    decodificar_audio_psx()