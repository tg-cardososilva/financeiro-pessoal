from pathlib import Path

p=Path('app.js')
s=p.read_text()
old="""  } catch (err) {
    console.error('Falha ao carregar dados do Jarvis:', err)
    state.jarvis.error = humanError(err)
  } finally {
"""
new="""  } catch (err) {
    console.error('Falha ao carregar dados do Jarvis:', err)
    state.jarvis.error = humanError(err)
    state.jarvis.loaded = true
    toast(state.jarvis.error, 'error')
  } finally {
"""
if s.count(old)!=1:
    raise SystemExit(f'loader catch anchor count={s.count(old)}')
s=s.replace(old,new,1)
p.write_text(s)
print('loader failure guard restored')
