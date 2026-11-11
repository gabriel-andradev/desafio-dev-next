import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

const buildDto = (password: string) =>
  plainToInstance(RegisterDto, {
    name: 'Gabriel Cobuccio',
    email: 'gabriel@cobuccio.com',
    cpf: '11122233344',
    password,
  });

describe('RegisterDto password policy (same as the PHP version)', () => {
  it('should reject passwords shorter than 8 characters', async () => {
    const errors = await validate(buildDto('1234567'));

    expect(errors.map((error) => error.property)).toContain('password');
  });

  it('should accept a password with exactly 8 characters', async () => {
    const errors = await validate(buildDto('12345678'));

    expect(errors).toHaveLength(0);
  });
});
